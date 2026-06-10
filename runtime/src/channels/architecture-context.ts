import fs from "node:fs";
import path from "node:path";
import {
  KNOWLEDGE_GATE_LABELS,
  loadKnowledgeApprovals,
  loadKnowledgeIndex,
  type KnowledgeLayer,
} from "../knowledge-index.js";
import { evaluateProjectLifecycle } from "../project-lifecycle.js";
import type { Manifest } from "../types.js";
import { formatAdrIndexMarkdown, listAdrs } from "./adr-generator.js";

export interface ArchitectureReadiness {
  ready: boolean;
  business_approved: boolean;
  discovery_complete: boolean;
  missing: string[];
  block_message?: string;
}

export function isLayerApproved(projectDir: string, layer: KnowledgeLayer): boolean {
  const approvals = loadKnowledgeApprovals(projectDir);
  if (approvals.layers?.[layer] === "approved") return true;
  const index = loadKnowledgeIndex(projectDir);
  return index?.layers?.[layer]?.layer_status === "approved";
}

export function loadApprovedLayerSnippet(
  projectDir: string,
  layer: KnowledgeLayer,
  maxChars = 6000
): string {
  if (!isLayerApproved(projectDir, layer)) {
    return `### ${layer} knowledge\n\n_Not approved yet — approve \`${KNOWLEDGE_GATE_LABELS[layer]}\` before relying on this layer in architecture._`;
  }

  const index = loadKnowledgeIndex(projectDir);
  const approvedPaths = new Set(
    index?.layers?.[layer]?.files.filter((f) => f.status === "approved").map((f) => f.path) ?? []
  );

  const base = path.join(projectDir, "docs", "knowledge", layer);
  if (!fs.existsSync(base)) return "";

  const parts: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (parts.join("").length > maxChars) return;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full, `${prefix}${name}/`);
        continue;
      }
      if (!name.endsWith(".md")) continue;
      const displayPath = `docs/knowledge/${layer}/${prefix}${name}`;
      if (index && approvedPaths.size > 0 && !approvedPaths.has(displayPath)) continue;
      parts.push(`#### ${prefix}${name}\n${fs.readFileSync(full, "utf8").slice(0, 1200)}`);
    }
  };
  walk(base, "");
  return parts.length ?
      `### Approved ${layer} knowledge\n\n${parts.join("\n\n")}`
    : `### Approved ${layer} knowledge\n\n_No markdown files in this layer._`;
}

export function loadAdrCatalogSnippet(projectDir: string): string {
  const adrs = listAdrs(projectDir);
  return `### Architecture Decision Records (existing)\n\n${formatAdrIndexMarkdown(adrs)}`;
}

export function evaluateArchitectureReadiness(opts: {
  projectDir: string;
  manifest: Manifest;
}): ArchitectureReadiness {
  const businessApproved = isLayerApproved(opts.projectDir, "business");
  const lifecycle = evaluateProjectLifecycle({
    projectDir: opts.projectDir,
    manifest: opts.manifest,
  });

  const discoveryPhase = lifecycle.phases.find((p) => p.phase === "discovery");
  const discoveryComplete =
    !lifecycle.enabled ? businessApproved : (discoveryPhase?.complete ?? false);
  const missing: string[] = [];

  if (!businessApproved) missing.push("knowledge:business-approved");
  if (!discoveryComplete) {
    missing.push(...(discoveryPhase?.missing ?? []).map((m) => `discovery:${m}`));
  }

  const ready = businessApproved && discoveryComplete;

  let block_message: string | undefined;
  if (!ready) {
    block_message = [
      "## Architecture phase blocked",
      "",
      "Complete **business discovery** before architecture conversation:",
      "",
      ...missing.map((m) => `- \`${m}\``),
      "",
      "Approve business knowledge (`approve_layer` action or CLI), then continue here.",
    ].join("\n");
  }

  return {
    ready,
    business_approved: businessApproved,
    discovery_complete: discoveryComplete,
    missing,
    block_message,
  };
}

export function buildArchitectureContextParts(projectDir: string): string[] {
  return [
    loadApprovedLayerSnippet(projectDir, "business"),
    loadApprovedLayerSnippet(projectDir, "product"),
    loadAdrCatalogSnippet(projectDir),
    loadTechnicalDraftSnippet(projectDir),
  ].filter(Boolean);
}

function loadTechnicalDraftSnippet(projectDir: string, maxChars = 4000): string {
  const base = path.join(projectDir, "docs", "knowledge", "technical");
  if (!fs.existsSync(base)) return "";

  const parts: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (parts.join("").length > maxChars) return;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "adr") return;
        walk(full, `${prefix}${name}/`);
        continue;
      }
      if (!name.endsWith(".md")) continue;
      parts.push(`#### ${prefix}${name}\n${fs.readFileSync(full, "utf8").slice(0, 800)}`);
    }
  };
  walk(base, "");
  return parts.length ?
      `### Technical knowledge (drafts, non-ADR)\n\n${parts.join("\n\n")}`
    : "";
}
