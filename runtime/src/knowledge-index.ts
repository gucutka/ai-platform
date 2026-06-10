import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import YAML from "yaml";
import type { FileSnippet, Manifest } from "./types.js";
import { readFileSnippet } from "./dependency-graph.js";

export const KNOWLEDGE_LAYERS = ["business", "product", "technical"] as const;
export type KnowledgeLayer = (typeof KNOWLEDGE_LAYERS)[number];

export const KNOWLEDGE_GATE_LABELS: Record<KnowledgeLayer, string> = {
  business: "knowledge:business-approved",
  product: "knowledge:product-approved",
  technical: "knowledge:technical-approved",
};

export const CANONICAL_KNOWLEDGE_PREFIX = "docs/knowledge/";

export type KnowledgeFileStatus = "approved" | "draft";

export interface KnowledgeFileEntry {
  path: string;
  layer: KnowledgeLayer;
  sha256: string;
  status: KnowledgeFileStatus;
  status_source: "frontmatter" | "layer_approval" | "explicit_path" | "issue_label" | "open";
}

export interface KnowledgeLayerIndex {
  gate_label: string;
  layer_status: KnowledgeFileStatus;
  files: KnowledgeFileEntry[];
}

export interface KnowledgeIndex {
  contract: "KnowledgeIndex";
  version: "1.0";
  project_id: string;
  knowledge_index_hash: string;
  built_at: string;
  layers: Partial<Record<KnowledgeLayer, KnowledgeLayerIndex>>;
  stats: {
    total_files: number;
    approved_files: number;
    draft_files: number;
  };
}

export interface KnowledgeApprovals {
  version?: string;
  layers?: Partial<Record<KnowledgeLayer, KnowledgeFileStatus>>;
  approved_paths?: string[];
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function knowledgeIndexPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "knowledge", "index.json");
}

export function knowledgeApprovalsPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "knowledge", "approvals.yaml");
}

export function loadKnowledgeApprovals(projectDir: string): KnowledgeApprovals {
  const p = knowledgeApprovalsPath(projectDir);
  if (!fs.existsSync(p)) return {};
  return YAML.parse(fs.readFileSync(p, "utf8")) as KnowledgeApprovals;
}

export function loadKnowledgeIndex(projectDir: string): KnowledgeIndex | null {
  const p = knowledgeIndexPath(projectDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as KnowledgeIndex;
}

export function parseKnowledgeFrontmatter(raw: string): { status?: KnowledgeFileStatus; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { body: raw };
  const fm = YAML.parse(match[1]) as { status?: string } | null;
  const status =
    fm?.status === "approved" || fm?.status === "draft"
      ? (fm.status as KnowledgeFileStatus)
      : undefined;
  return { status, body: match[2] ?? "" };
}

function layerApprovedByIssueLabel(layer: KnowledgeLayer, issueLabels: string[]): boolean {
  return issueLabels.includes(KNOWLEDGE_GATE_LABELS[layer]);
}

function resolveFileStatus(opts: {
  layer: KnowledgeLayer;
  displayPath: string;
  frontmatterStatus?: KnowledgeFileStatus;
  approvals: KnowledgeApprovals;
  issueLabels: string[];
  requireApproval: boolean;
}): { status: KnowledgeFileStatus; source: KnowledgeFileEntry["status_source"] } {
  if (!opts.requireApproval) {
    return { status: "approved", source: "open" };
  }

  if (opts.frontmatterStatus === "approved") {
    return { status: "approved", source: "frontmatter" };
  }
  if (opts.frontmatterStatus === "draft") {
    return { status: "draft", source: "frontmatter" };
  }

  if (opts.approvals.approved_paths?.includes(opts.displayPath)) {
    return { status: "approved", source: "explicit_path" };
  }

  if (layerApprovedByIssueLabel(opts.layer, opts.issueLabels)) {
    return { status: "approved", source: "issue_label" };
  }

  const layerStatus = opts.approvals.layers?.[opts.layer];
  if (layerStatus === "approved") {
    return { status: "approved", source: "layer_approval" };
  }
  if (layerStatus === "draft") {
    return { status: "draft", source: "layer_approval" };
  }

  return { status: "draft", source: "open" };
}

export function filterKnowledgeLayersForManifest(
  layers: string[],
  manifest: Manifest
): string[] {
  const scopes = manifest.knowledge_scopes;
  if (!scopes?.length) return layers.filter((l) => l !== "code");
  return layers.filter((l) => l === "code" || scopes.includes(l));
}

export function knowledgeEnforcementEnabled(manifest: Manifest): boolean {
  return manifest.knowledge_enforcement !== false;
}

export function knowledgeApprovalRequired(manifest: Manifest): boolean {
  if (manifest.knowledge_require_approval === false) return false;
  return knowledgeEnforcementEnabled(manifest);
}

export function buildKnowledgeIndex(
  projectDir: string,
  manifest: Manifest,
  issueLabels: string[] = []
): KnowledgeIndex {
  const approvals = loadKnowledgeApprovals(projectDir);
  const requireApproval = knowledgeApprovalRequired(manifest);
  const layers: Partial<Record<KnowledgeLayer, KnowledgeLayerIndex>> = {};
  let totalFiles = 0;
  let approvedFiles = 0;
  let draftFiles = 0;

  for (const layer of KNOWLEDGE_LAYERS) {
    const base = path.join(projectDir, "docs", "knowledge", layer);
    const files: KnowledgeFileEntry[] = [];
    if (fs.existsSync(base)) {
      const relPaths = glob.sync("**/*.{md,yaml,yml,json,txt}", {
        cwd: base,
        nodir: true,
        ignore: ["**/node_modules/**"],
      });

      for (const rel of relPaths) {
        const displayPath = `${CANONICAL_KNOWLEDGE_PREFIX}${layer}/${rel}`;
        const abs = path.join(base, rel);
        const raw = fs.readFileSync(abs, "utf8");
        const { status: fmStatus } = parseKnowledgeFrontmatter(raw);
        const { status, source } = resolveFileStatus({
          layer,
          displayPath,
          frontmatterStatus: fmStatus,
          approvals,
          issueLabels,
          requireApproval,
        });
        const entry: KnowledgeFileEntry = {
          path: displayPath,
          layer,
          sha256: hashContent(raw),
          status,
          status_source: source,
        };
        files.push(entry);
        totalFiles++;
        if (status === "approved") approvedFiles++;
        else draftFiles++;
      }
    }

    const layerStatus: KnowledgeFileStatus =
      files.length === 0
        ? "draft"
        : files.every((f) => f.status === "approved")
          ? "approved"
          : "draft";

    layers[layer] = {
      gate_label: KNOWLEDGE_GATE_LABELS[layer],
      layer_status: layerStatus,
      files,
    };
  }

  const indexBase = {
    contract: "KnowledgeIndex" as const,
    version: "1.0" as const,
    project_id: manifest.project_id,
    built_at: new Date().toISOString(),
    layers,
    stats: {
      total_files: totalFiles,
      approved_files: approvedFiles,
      draft_files: draftFiles,
    },
  };

  const knowledge_index_hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        project_id: manifest.project_id,
        layers: Object.fromEntries(
          KNOWLEDGE_LAYERS.map((l) => [
            l,
            (layers[l]?.files ?? []).map((f) => ({ p: f.path, h: f.sha256, s: f.status })),
          ])
        ),
      })
    )
    .digest("hex")
    .slice(0, 16);

  return { ...indexBase, knowledge_index_hash };
}

export function saveKnowledgeIndex(projectDir: string, index: KnowledgeIndex): string {
  const dir = path.join(projectDir, ".ai-platform", "knowledge");
  fs.mkdirSync(dir, { recursive: true });
  const out = knowledgeIndexPath(projectDir);
  fs.writeFileSync(out, JSON.stringify(index, null, 2));
  return out;
}

export async function loadApprovedKnowledgeFiles(opts: {
  projectDir: string;
  layers: string[];
  maxFiles: number;
  maxBytes: number;
  manifest: Manifest;
  issueLabels?: string[];
}): Promise<{ files: FileSnippet[]; index: KnowledgeIndex | null; skipped: number }> {
  const enforcement = knowledgeEnforcementEnabled(opts.manifest);
  const scopedLayers = filterKnowledgeLayersForManifest(opts.layers, opts.manifest).filter(
    (l): l is KnowledgeLayer => (KNOWLEDGE_LAYERS as readonly string[]).includes(l)
  );

  if (!enforcement) {
    const files = await loadKnowledgeDocsLegacy(
      opts.projectDir,
      scopedLayers,
      opts.maxFiles,
      opts.maxBytes
    );
    return { files, index: null, skipped: 0 };
  }

  let index = loadKnowledgeIndex(opts.projectDir);
  if (!index) {
    index = buildKnowledgeIndex(opts.projectDir, opts.manifest, opts.issueLabels ?? []);
    saveKnowledgeIndex(opts.projectDir, index);
  }

  const requireApproval = knowledgeApprovalRequired(opts.manifest);
  const snippets: FileSnippet[] = [];
  let skipped = 0;

  for (const layer of scopedLayers) {
    const layerIndex = index.layers[layer];
    if (!layerIndex) continue;

    for (const entry of layerIndex.files) {
      if (snippets.length >= opts.maxFiles) break;

      let approved = entry.status === "approved";
      if (requireApproval && opts.issueLabels?.length) {
        const live = resolveFileStatus({
          layer,
          displayPath: entry.path,
          approvals: loadKnowledgeApprovals(opts.projectDir),
          issueLabels: opts.issueLabels,
          requireApproval: true,
        });
        if (layerApprovedByIssueLabel(layer, opts.issueLabels)) {
          approved = true;
        } else if (live.status === "approved") {
          approved = true;
        }
      }

      if (!approved) {
        skipped++;
        continue;
      }

      const snip = readFileSnippet(opts.projectDir, entry.path, opts.maxBytes);
      if (snip) snippets.push(snip);
    }
  }

  return { files: snippets, index, skipped };
}

async function loadKnowledgeDocsLegacy(
  projectDir: string,
  layers: string[],
  maxFiles: number,
  maxBytes: number
): Promise<FileSnippet[]> {
  const snippets: FileSnippet[] = [];
  const seen = new Set<string>();

  for (const layer of layers) {
    const base = path.join(projectDir, "docs", "knowledge", layer);
    if (!fs.existsSync(base)) continue;

    const files = await glob("**/*.{md,yaml,yml,json,txt}", {
      cwd: base,
      nodir: true,
      ignore: ["**/node_modules/**"],
    });

    for (const rel of files) {
      if (snippets.length >= maxFiles) return snippets;
      const displayPath = `${CANONICAL_KNOWLEDGE_PREFIX}${layer}/${rel}`;
      if (seen.has(displayPath)) continue;
      seen.add(displayPath);

      const snip = readFileSnippet(projectDir, displayPath, maxBytes);
      if (snip) snippets.push(snip);
    }
  }

  return snippets;
}

export function isCanonicalKnowledgePath(filePath: string): boolean {
  return (
    filePath === CANONICAL_KNOWLEDGE_PREFIX.slice(0, -1) ||
    filePath.startsWith(CANONICAL_KNOWLEDGE_PREFIX)
  );
}
