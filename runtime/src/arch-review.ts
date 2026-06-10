import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import type { CodeChanges, Manifest } from "./types.js";
import type { WorkflowDecisionRecord } from "./workflow-router.js";

export const ARCH_REVIEW_LABELS = {
  pending: "arch-review:pending",
  passed: "arch-review:passed",
  failed: "arch-review:failed",
} as const;

export class ArchitectureReviewFailedError extends Error {
  readonly issueId: number;
  readonly prNumber: number;
  readonly verdict: string;

  constructor(issueId: number, prNumber: number, verdict: string) {
    super(`Architecture review ${verdict} for issue #${issueId} (PR #${prNumber})`);
    this.name = "ArchitectureReviewFailedError";
    this.issueId = issueId;
    this.prNumber = prNumber;
    this.verdict = verdict;
  }
}

interface ArchReviewSkipRule {
  raw: string;
}

let skipRulesCache: ArchReviewSkipRule[] | null = null;

function loadSkipRules(): ArchReviewSkipRule[] {
  if (skipRulesCache) return skipRulesCache;
  const file = path.join(getPlatformRoot(), "policies", "routing-rules.yaml");
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as {
    arch_review_skip?: string[];
  };
  skipRulesCache = (raw.arch_review_skip ?? []).map((r) => ({ raw: r }));
  return skipRulesCache;
}

/** Enabled when manifest flag set (default off in demo). */
export function isArchitectureReviewEnabled(manifest: Manifest): boolean {
  return manifest.gates?.architecture_review_agent === true;
}

function labelSet(labels: string[]): Set<string> {
  return new Set(labels.map((l) => l.toLowerCase()));
}

function resolveRisk(labels: string[]): string {
  const ls = labelSet(labels);
  if (ls.has("risk:high")) return "high";
  if (ls.has("risk:medium")) return "medium";
  if (ls.has("risk:low")) return "low";
  return "";
}

function isSingleConfigFileChange(changes?: CodeChanges): boolean {
  if (!changes?.files?.length || changes.files.length !== 1) return false;
  const p = changes.files[0].path;
  return /^(package\.json|package-lock\.json|tsconfig\.json|.*\.config\.(js|ts|mjs|cjs)|\.env\.example)$/.test(
    p
  );
}

function hasNoCodeChanges(changes?: CodeChanges): boolean {
  if (!changes?.files?.length) return true;
  return changes.files.every(
    (f) => f.path.startsWith("docs/") || f.path.endsWith(".md") || f.path.startsWith("README")
  );
}

function matchesSkipRule(
  rule: ArchReviewSkipRule,
  opts: {
    triage: Record<string, unknown>;
    labels: string[];
    changes?: CodeChanges;
  }
): boolean {
  const ls = labelSet(opts.labels);
  const classification = String(opts.triage.classification ?? "").toLowerCase();
  const risk = resolveRisk(opts.labels);
  const routing = opts.triage.routing as { area?: string } | undefined;
  const area = String(routing?.area ?? "").toLowerCase();
  const areaDocs = ls.has("area:docs") || area === "docs";

  const parts = rule.raw.split(/\s+AND\s+/i).map((p) => p.trim());
  return parts.every((part) => {
    if (part === "risk:low") return risk === "low";
    if (part === "area:docs") return areaDocs;
    if (part === "type:chore") return classification === "chore";
    if (part === "no_code_changes") return hasNoCodeChanges(opts.changes);
    if (part === "single_config_file") return isSingleConfigFileChange(opts.changes);
    return false;
  });
}

export function shouldSkipArchitectureReview(opts: {
  manifest: Manifest;
  workflowDecision: WorkflowDecisionRecord;
  triage: Record<string, unknown>;
  labels: string[];
  changes?: CodeChanges;
}): boolean {
  if (!isArchitectureReviewEnabled(opts.manifest)) return true;
  if (opts.workflowDecision.risk_level === "low") return true;
  const skipStages = new Set(
    opts.workflowDecision.skip_stages.map((s) => s.toLowerCase())
  );
  if (skipStages.has("architecture-review")) return true;
  if (!opts.workflowDecision.sdlc_path.includes("architecture-review")) return true;
  for (const rule of loadSkipRules()) {
    if (matchesSkipRule(rule, opts)) return true;
  }
  return false;
}

export function isArchitectureReviewRequired(opts: {
  manifest: Manifest;
  workflowDecision: WorkflowDecisionRecord;
  triage: Record<string, unknown>;
  labels: string[];
  changes?: CodeChanges;
}): boolean {
  return !shouldSkipArchitectureReview(opts);
}

export function architectureReviewVerdictPassed(verdict: string): boolean {
  return String(verdict).toUpperCase() === "PASS";
}
