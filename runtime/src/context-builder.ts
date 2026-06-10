import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import YAML from "yaml";
import type { ContextPack, FileSnippet, Manifest } from "./types.js";
import { getPlatformRoot, getRunsDir } from "./config.js";
import type { GitHubClient } from "./github.js";
import {
  codeRetrievalMode,
  resolveAgentTier,
  resolveKnowledgeLayers,
  resolveTopK,
  shouldUseCodeGraph,
} from "./retrieval-policy.js";
import {
  expandWithImportNeighbors,
  readFileSnippet,
} from "./dependency-graph.js";
import {
  compressToTokenBudget,
  isBlockedPath,
  loadTokenBudgetRules,
  resolveContextBudget,
} from "./context-budget.js";
import {
  buildContextPackRefs,
  hashContextPack,
} from "./context-pack-store.js";
import {
  filterKnowledgeLayersForManifest,
  loadApprovedKnowledgeFiles,
  loadKnowledgeIndex,
} from "./knowledge-index.js";
import { applyTierPreset } from "./tier-presets.js";

export function loadManifest(projectDir: string): Manifest {
  const p = path.join(projectDir, ".ai-platform", "manifest.yaml");
  if (!fs.existsSync(p)) {
    throw new Error(`Manifest not found: ${p}`);
  }
  const raw = YAML.parse(fs.readFileSync(p, "utf8")) as Manifest;
  return applyTierPreset(raw);
}

export async function loadKnowledgeDocsForLayers(
  projectDir: string,
  layers: string[],
  maxFiles: number,
  maxBytes: number,
  opts?: {
    manifest?: Manifest;
    issueLabels?: string[];
  }
): Promise<FileSnippet[]> {
  if (!opts?.manifest) {
    return loadKnowledgeDocsForLayersLegacy(projectDir, layers, maxFiles, maxBytes);
  }
  const { files } = await loadApprovedKnowledgeFiles({
    projectDir,
    layers,
    maxFiles,
    maxBytes,
    manifest: opts.manifest,
    issueLabels: opts.issueLabels,
  });
  return files;
}

async function loadKnowledgeDocsForLayersLegacy(
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
      const displayPath = `docs/knowledge/${layer}/${rel}`;
      if (seen.has(displayPath)) continue;
      seen.add(displayPath);

      const snip = readFileSnippet(projectDir, displayPath, maxBytes);
      if (snip) snippets.push(snip);
    }
  }

  return snippets;
}

export async function loadCodeFilesForAgent(opts: {
  projectDir: string;
  manifest: Manifest;
  agentId: string;
  hints: string[];
  budget: ReturnType<typeof resolveContextBudget>;
  prDiff?: string;
}): Promise<FileSnippet[]> {
  const mode = codeRetrievalMode(opts.agentId);

  if (mode === "diff_only" && opts.prDiff) {
    return [{ path: "PR_DIFF.md", content: opts.prDiff.slice(0, 20000) }];
  }

  if (mode === "test_files_only") {
    return loadFilteredCodeFiles(opts, (rel) =>
      /(?:^tests\/|\.test\.|\.spec\.|__tests__)/.test(rel)
    );
  }

  const allowed = opts.manifest.allowed_paths ?? ["src/**", "tests/**"];
  let candidates = await listScoredCodeFiles(opts.projectDir, allowed, opts.hints);

  if (shouldUseCodeGraph(opts.agentId) && opts.hints.length) {
    const neighbors = expandWithImportNeighbors(
      opts.projectDir,
      opts.hints.filter((h) => !h.includes("*")),
      allowed,
      8
    );
    for (const n of neighbors) {
      if (!candidates.includes(n)) candidates.unshift(n);
    }
  }

  const snippets: FileSnippet[] = [];
  for (const rel of candidates.slice(0, opts.budget.max_files)) {
    if (isBlockedPath(rel)) continue;
    const snip = readFileSnippet(opts.projectDir, rel, opts.budget.max_file_bytes);
    if (snip) snippets.push(snip);
  }
  return snippets;
}

async function loadFilteredCodeFiles(
  opts: {
    projectDir: string;
    manifest: Manifest;
    hints: string[];
    budget: ReturnType<typeof resolveContextBudget>;
  },
  filter: (rel: string) => boolean
): Promise<FileSnippet[]> {
  const allowed = opts.manifest.allowed_paths ?? ["src/**", "tests/**"];
  const candidates = (await listScoredCodeFiles(opts.projectDir, allowed, opts.hints)).filter(
    filter
  );
  return candidates
    .slice(0, opts.budget.max_files)
    .map((rel) => readFileSnippet(opts.projectDir, rel, opts.budget.max_file_bytes))
    .filter((s): s is FileSnippet => !!s);
}

async function listScoredCodeFiles(
  projectDir: string,
  allowed: string[],
  hints: string[]
): Promise<string[]> {
  const patterns = allowed.flatMap((p) =>
    p.endsWith("/**") ? [p, p.replace("/**", "/*")] : [p]
  );
  const all = await glob(patterns, {
    cwd: projectDir,
    nodir: true,
    ignore: ["**/node_modules/**", "**/dist/**", ".git/**"],
  });

  const scored = all
    .filter((rel) => !isBlockedPath(rel))
    .map((rel) => {
      let score = 0;
      for (const h of hints) {
        if (h && rel.includes(h)) score += 10;
      }
      if (rel.includes("index")) score += 2;
      return { rel, score };
    });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.rel);
}

export function loadStoredContracts(
  projectDir: string,
  issueNumber: number
): Record<string, unknown> {
  const dir = path.join(getRunsDir(projectDir), String(issueNumber));
  const out: Record<string, unknown> = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("context-pack-")) continue;
    const data = JSON.parse(
      fs.readFileSync(path.join(dir, f), "utf8")
    ) as Record<string, unknown>;
    const c = data.contract as string;
    if (c && c !== "ContextPack") out[c] = data;
  }
  return out;
}

export async function buildContextPack(opts: {
  projectDir: string;
  issue: { number: number; title: string; body: string; labels: string[] };
  agentId: string;
  dispatchId?: string;
  contracts?: Record<string, unknown>;
  fileHints?: string[];
  skillsText?: string;
  prDiff?: string;
  prNumber?: number;
}): Promise<ContextPack> {
  const manifest = loadManifest(opts.projectDir);
  const tier = resolveAgentTier(opts.agentId);
  const topK = resolveTopK(opts.agentId);
  const budget = resolveContextBudget(opts.agentId, tier, topK);
  const tokenRules = loadTokenBudgetRules();

  const knowledgeLayers = filterKnowledgeLayersForManifest(
    resolveKnowledgeLayers(opts.agentId),
    manifest
  );
  const knowledgeResult = await loadApprovedKnowledgeFiles({
    projectDir: opts.projectDir,
    layers: knowledgeLayers,
    maxFiles: budget.max_knowledge_files,
    maxBytes: budget.max_file_bytes,
    manifest,
    issueLabels: opts.issue.labels,
  });
  const knowledgeFiles = knowledgeResult.files;
  const knowledgeIndex =
    knowledgeResult.index ?? loadKnowledgeIndex(opts.projectDir);

  let codeFiles = await loadCodeFilesForAgent({
    projectDir: opts.projectDir,
    manifest,
    agentId: opts.agentId,
    hints: opts.fileHints ?? [],
    budget,
    prDiff: opts.prDiff,
  });

  if (opts.prDiff && !codeFiles.some((f) => f.path === "PR_DIFF.md")) {
    codeFiles = [
      { path: "PR_DIFF.md", content: opts.prDiff.slice(0, 20000) },
      ...codeFiles.slice(0, Math.max(0, budget.max_files - 1)),
    ];
  }

  const files = [...knowledgeFiles, ...codeFiles].slice(0, budget.max_files + budget.max_knowledge_files);

  const stored = loadStoredContracts(opts.projectDir, opts.issue.number);
  const contracts = { ...stored, ...opts.contracts };
  if (opts.prNumber) {
    contracts.ReviewContext = {
      contract: "ReviewContext",
      version: "1.0",
      pr_number: opts.prNumber,
    };
  }

  const refs = buildContextPackRefs(files);
  const builtAt = new Date().toISOString();
  const dispatchId =
    opts.dispatchId ??
    `ctx-${opts.issue.number}-${opts.agentId}-${Date.now().toString(36)}`;

  const packBase: ContextPack = {
    contract: "ContextPack",
    version: "1.0",
    dispatch_id: dispatchId,
    target_agent: opts.agentId,
    tier,
    issue: opts.issue,
    manifest,
    contracts,
    files,
    skills_text: opts.skillsText ?? "",
    refs,
    token_budget: {
      tier_limit_tokens: budget.max_tokens,
      estimated_prompt_tokens: 0,
    },
    sections: {
      retrieved_knowledge: knowledgeFiles.length,
      retrieved_code: codeFiles.length,
      upstream_contracts: Object.keys(contracts).length,
      knowledge_skipped_draft: knowledgeResult.skipped,
    },
    knowledge_index_hash: knowledgeIndex?.knowledge_index_hash,
    freshness: {
      built_at: builtAt,
      stage: opts.agentId,
      cache_key: `${opts.issue.number}:${opts.agentId}:${refs.map((r) => r.sha256).join(",")}`,
      ttl_seconds: tokenRules.cache?.context_pack_ttl ?? 3600,
    },
  };

  const promptPreview = contextPackToPrompt(packBase);
  const compressed = compressToTokenBudget(promptPreview, budget.max_tokens);
  packBase.token_budget!.estimated_prompt_tokens = compressed.estimated_tokens;
  if (compressed.compressed) {
    packBase.sections!.compressed = true;
  }

  packBase.context_pack_hash = hashContextPack(packBase);
  return packBase;
}

export async function buildContextFromGitHub(
  github: GitHubClient,
  projectDir: string,
  issueNumber: number,
  agentId: string,
  skillsText: string,
  extra?: {
    prDiff?: string;
    fileHints?: string[];
    prNumber?: number;
    dispatchId?: string;
  }
): Promise<ContextPack> {
  const issue = await github.getIssue(issueNumber);
  const labels = issue.labels.map((l) =>
    typeof l === "string" ? l : l.name ?? ""
  );
  return buildContextPack({
    projectDir,
    issue: {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels,
    },
    agentId,
    dispatchId: extra?.dispatchId,
    fileHints: extra?.fileHints,
    skillsText,
    prDiff: extra?.prDiff,
    prNumber: extra?.prNumber,
  });
}

export function contextPackToPrompt(pack: ContextPack): string {
  return `# ContextPack v1

**Agent:** ${pack.target_agent} | **Tier:** ${pack.tier} | **Hash:** ${pack.context_pack_hash ?? "pending"}

## Issue #${pack.issue.number}: ${pack.issue.title}

${pack.issue.body}

Labels: ${pack.issue.labels.join(", ")}

## Manifest (project_id: ${pack.manifest.project_id})

\`\`\`yaml
${JSON.stringify(pack.manifest, null, 2)}
\`\`\`

## Upstream Contracts

\`\`\`json
${JSON.stringify(pack.contracts, null, 2)}
\`\`\`

## File refs (${pack.refs?.length ?? pack.files.length})

${(pack.refs ?? [])
  .map((r) => `- \`${r.path}\` (${r.kind}, ${r.sha256})`)
  .join("\n")}

## Repository Files

${pack.files.length ? pack.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n") : "_No repository/knowledge files loaded._"}

## Skills

${pack.skills_text}
`;
}

/** Prompt text sent to the model — respects tier compression. */
export function contextPackToAgentPrompt(pack: ContextPack): string {
  const limit = pack.token_budget?.tier_limit_tokens ?? 16000;
  return compressToTokenBudget(contextPackToPrompt(pack), limit).text;
}
