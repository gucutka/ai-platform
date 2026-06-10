import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import {
  KNOWLEDGE_GATE_LABELS,
  loadKnowledgeApprovals,
  loadKnowledgeIndex,
  type KnowledgeLayer,
} from "./knowledge-index.js";
import type { Manifest } from "./types.js";

export type LifecyclePhaseId = "intake" | "discovery" | "architecture" | "development";

export interface LifecyclePhaseDef {
  label: string;
  requirements: string[];
  enabled_when?: LifecyclePhaseId[];
}

export interface ProjectLifecycleConfig {
  version: string;
  enabled: boolean;
  phases: Record<LifecyclePhaseId, LifecyclePhaseDef>;
}

export interface PhaseStatus {
  phase: LifecyclePhaseId;
  label: string;
  complete: boolean;
  missing: string[];
}

export interface LifecycleEvaluation {
  contract: "LifecycleEvaluation";
  version: "1.0";
  enabled: boolean;
  development_enabled: boolean;
  phases: PhaseStatus[];
  missing_for_development: string[];
}

const DEFAULT_LIFECYCLE: ProjectLifecycleConfig = {
  version: "1.0",
  enabled: true,
  phases: {
    intake: {
      label: "Project intake",
      requirements: ["repo_scaffolded"],
    },
    discovery: {
      label: "Business discovery",
      requirements: ["knowledge:business-approved"],
      enabled_when: ["intake"],
    },
    architecture: {
      label: "Architecture",
      requirements: ["knowledge:technical-approved"],
      enabled_when: ["discovery"],
    },
    development: {
      label: "Development",
      requirements: [],
      enabled_when: ["discovery", "architecture"],
    },
  },
};

export function defaultLifecyclePath(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "templates", "project-lifecycle.yaml");
}

export function projectLifecyclePath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "project-lifecycle.yaml");
}

export function loadProjectLifecycleConfig(
  projectDir: string,
  platformRoot?: string
): ProjectLifecycleConfig {
  const projectFile = projectLifecyclePath(projectDir);
  if (fs.existsSync(projectFile)) {
    return YAML.parse(fs.readFileSync(projectFile, "utf8")) as ProjectLifecycleConfig;
  }
  const defaultFile = defaultLifecyclePath(platformRoot);
  if (fs.existsSync(defaultFile)) {
    return YAML.parse(fs.readFileSync(defaultFile, "utf8")) as ProjectLifecycleConfig;
  }
  return DEFAULT_LIFECYCLE;
}

function requirementMet(
  req: string,
  opts: {
    projectDir: string;
    issueLabels: string[];
    manifest: Manifest;
  }
): boolean {
  if (req === "repo_scaffolded") {
    return (
      fs.existsSync(path.join(opts.projectDir, ".ai-platform", "manifest.yaml")) &&
      fs.existsSync(path.join(opts.projectDir, "package.json"))
    );
  }

  if (req.startsWith("knowledge:")) {
    const layer = req.replace("knowledge:", "").replace("-approved", "") as KnowledgeLayer;
    if (opts.issueLabels.includes(KNOWLEDGE_GATE_LABELS[layer])) return true;
    const approvals = loadKnowledgeApprovals(opts.projectDir);
    if (approvals.layers?.[layer] === "approved") return true;
    const index = loadKnowledgeIndex(opts.projectDir);
    const layerIndex = index?.layers?.[layer];
    if (layerIndex?.layer_status === "approved") return true;
    return false;
  }

  if (req.startsWith("label:")) {
    const label = req.slice("label:".length);
    return opts.issueLabels.includes(label);
  }

  return false;
}

function phaseComplete(
  phase: LifecyclePhaseDef,
  opts: {
    projectDir: string;
    issueLabels: string[];
    manifest: Manifest;
  }
): { complete: boolean; missing: string[] } {
  const missing = phase.requirements.filter((r) => !requirementMet(r, opts));
  return { complete: missing.length === 0, missing };
}

export function evaluateProjectLifecycle(opts: {
  projectDir: string;
  manifest: Manifest;
  issueLabels?: string[];
  platformRoot?: string;
}): LifecycleEvaluation {
  const config = loadProjectLifecycleConfig(opts.projectDir, opts.platformRoot);
  const labels = opts.issueLabels ?? [];

  if (config.enabled === false || opts.manifest.lifecycle_enabled === false) {
    return {
      contract: "LifecycleEvaluation",
      version: "1.0",
      enabled: false,
      development_enabled: true,
      phases: [],
      missing_for_development: [],
    };
  }

  const ctx = {
    projectDir: opts.projectDir,
    issueLabels: labels,
    manifest: opts.manifest,
  };

  const phaseIds = Object.keys(config.phases) as LifecyclePhaseId[];
  const statuses: PhaseStatus[] = [];
  const completed = new Set<LifecyclePhaseId>();

  for (const phaseId of phaseIds) {
    const def = config.phases[phaseId];
    if (!def) continue;

    const prereqs = def.enabled_when ?? [];
    const prereqsMet = prereqs.every((p) => completed.has(p));
    let { complete, missing } = phaseComplete(def, ctx);

    if (!prereqsMet) {
      complete = false;
      missing = [...missing, ...prereqs.filter((p) => !completed.has(p)).map((p) => `phase:${p}`)];
    }

    if (complete) completed.add(phaseId);

    statuses.push({
      phase: phaseId,
      label: def.label,
      complete,
      missing,
    });
  }

  const devPhase = config.phases.development;
  const devPrereqs = devPhase?.enabled_when ?? ["discovery", "architecture"];
  const devEnabled = devPrereqs.every((p) => completed.has(p));
  const missingForDev = statuses
    .filter((s) => !s.complete && s.phase !== "development")
    .flatMap((s) => s.missing.map((m) => `${s.phase}:${m}`));

  return {
    contract: "LifecycleEvaluation",
    version: "1.0",
    enabled: true,
    development_enabled: devEnabled,
    phases: statuses,
    missing_for_development: missingForDev,
  };
}

export function formatLifecycleBlockComment(evaluation: LifecycleEvaluation): string {
  if (!evaluation.enabled) return "";
  const rows = evaluation.phases
    .map((p) => {
      const icon = p.complete ? "✅" : "⏳";
      const miss = p.missing.length ? ` — missing: ${p.missing.join(", ")}` : "";
      return `- ${icon} **${p.label}** (\`${p.phase}\`)${miss}`;
    })
    .join("\n");

  return [
    "## Project lifecycle",
    "",
    rows,
    "",
    evaluation.development_enabled
      ? "_Development pipeline is **enabled**._"
      : `_Development pipeline is **blocked** until: ${evaluation.missing_for_development.join("; ") || "prerequisites complete"}._`,
  ].join("\n");
}

export function writeDefaultProjectLifecycle(projectDir: string, platformRoot?: string): string {
  const src = defaultLifecyclePath(platformRoot);
  const dest = projectLifecyclePath(projectDir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  } else {
    fs.writeFileSync(dest, YAML.stringify(DEFAULT_LIFECYCLE));
  }
  return dest;
}
