import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import type { Manifest } from "./types.js";
import {
  formatContractDetails,
  formatStatusHeader,
  humanAgentName,
  machineMarker,
} from "./comment-format.js";
import { formatContractComment } from "./contracts.js";

export const ARCHITECT_GATE_LABELS = {
  pending: "architect-gate:pending",
  approved: "architect-gate:approved",
  rejected: "architect-gate:rejected",
} as const;

export class ArchitectGatePendingError extends Error {
  readonly issueId: number;
  constructor(issueId: number) {
    super(`Architect review gate pending for issue #${issueId}`);
    this.name = "ArchitectGatePendingError";
    this.issueId = issueId;
  }
}

export class ArchitectGateRejectedError extends Error {
  readonly issueId: number;
  constructor(issueId: number) {
    super(`Architect review gate rejected for issue #${issueId}`);
    this.name = "ArchitectGateRejectedError";
    this.issueId = issueId;
  }
}

export interface ArchitectReviewDecisionRecord {
  contract: "ArchitectReviewDecision";
  version: "1.0";
  issue_id: number;
  decision: "approved" | "rejected" | "pending";
  adr_references: string[];
  conditions?: string[];
  architect: string;
  source: "human-label" | "automated";
  product_spec_ref?: string;
  timestamp: string;
}

interface GateSkipRule {
  raw: string;
}

let skipRulesCache: GateSkipRule[] | null = null;

function loadSkipRules(): GateSkipRule[] {
  if (skipRulesCache) return skipRulesCache;
  const file = path.join(getPlatformRoot(), "policies", "routing-rules.yaml");
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as {
    architect_gate_skip?: string[];
  };
  skipRulesCache = (raw.architect_gate_skip ?? []).map((r) => ({ raw: r }));
  return skipRulesCache;
}

/** Gate on when manifest flag set or enterprise/regulated tier. */
export function isArchitectGateEnabled(manifest: Manifest): boolean {
  if (manifest.gates?.architect_review_gate === true) return true;
  const tier = String(manifest.client_tier ?? "standard").toLowerCase();
  return tier === "enterprise" || tier === "regulated";
}

function labelSet(labels: string[]): Set<string> {
  return new Set(labels.map((l) => l.toLowerCase()));
}

function matchesSkipRule(
  rule: GateSkipRule,
  opts: {
    triage: Record<string, unknown>;
    labels: string[];
    hasProductSpec: boolean;
  }
): boolean {
  const ls = labelSet(opts.labels);
  const classification = String(opts.triage.classification ?? "").toLowerCase();
  const risk =
    ls.has("risk:low") ? "low" : ls.has("risk:medium") ? "medium" : ls.has("risk:high") ? "high" : "";

  const parts = rule.raw.split(/\s+AND\s+/i).map((p) => p.trim());
  return parts.every((part) => {
    if (part === "risk:low") return risk === "low";
    if (part === "type:chore") return classification === "chore";
    if (part === "no_product_spec") return !opts.hasProductSpec;
    if (part === "no_code_changes") return false;
    return false;
  });
}

export function shouldSkipArchitectGate(opts: {
  manifest: Manifest;
  triage: Record<string, unknown>;
  labels: string[];
  hasProductSpec: boolean;
}): boolean {
  if (!isArchitectGateEnabled(opts.manifest)) return true;
  for (const rule of loadSkipRules()) {
    if (matchesSkipRule(rule, opts)) return true;
  }
  return false;
}

export function buildArchitectReviewDecision(opts: {
  issueId: number;
  decision: ArchitectReviewDecisionRecord["decision"];
  architect: string;
  productSpec?: Record<string, unknown>;
  source: ArchitectReviewDecisionRecord["source"];
}): ArchitectReviewDecisionRecord {
  const deps = opts.productSpec?.dependencies;
  return {
    contract: "ArchitectReviewDecision",
    version: "1.0",
    issue_id: opts.issueId,
    decision: opts.decision,
    adr_references: Array.isArray(deps) ? (deps as string[]) : [],
    conditions: [],
    architect: opts.architect,
    source: opts.source,
    product_spec_ref: opts.productSpec?.feature_summary
      ? String(opts.productSpec.feature_summary).slice(0, 120)
      : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function formatArchitectGateEscalationComment(opts: {
  issueId: number;
  architect: string;
  productSpec?: Record<string, unknown>;
  decision?: ArchitectReviewDecisionRecord;
}): string {
  const architect = opts.architect || "@architect";
  const summary = opts.productSpec?.feature_summary
    ? String(opts.productSpec.feature_summary)
    : "_ProductSpec pending review_";

  const contractBlock = opts.decision
    ? formatContractDetails(
        "ArchitectReviewDecision@1.0",
        opts.decision as unknown as Record<string, unknown>
      )
    : "";

  return [
    machineMarker("architect-gate"),
    formatStatusHeader("Architect review gate", "PENDING"),
    `Product spec is ready for **${architect}** before ${humanAgentName("technical-spec-agent")} and ${humanAgentName("plan-agent")} run.`,
    "",
    "### Product summary",
    "",
    summary,
    "",
    "### Next steps",
    "",
    `1. Review **ProductSpec@1.0** on this issue`,
    `2. Add \`${ARCHITECT_GATE_LABELS.approved}\` to resume the pipeline`,
    `3. Or add \`${ARCHITECT_GATE_LABELS.rejected}\` with feedback to block`,
    contractBlock,
  ]
    .filter((p) => p.trim())
    .join("\n\n");
}

export function formatArchitectGateApprovedComment(
  decision: ArchitectReviewDecisionRecord
): string {
  return formatContractComment("architect-gate", decision as unknown as Record<string, unknown>);
}

export function resolveArchitectHandle(manifest: Manifest): string {
  const owners = manifest.knowledge_owners as { architect?: string } | undefined;
  return owners?.architect ?? "@architect";
}

/** When gate enabled and product-spec ran — block downstream until approved. */
export function evaluateArchitectGateStatus(
  manifest: Manifest,
  labels: string[]
): { approved: boolean; rejected: boolean; pending: boolean } {
  const ls = new Set(labels);
  return {
    approved: ls.has(ARCHITECT_GATE_LABELS.approved),
    rejected: ls.has(ARCHITECT_GATE_LABELS.rejected),
    pending: ls.has(ARCHITECT_GATE_LABELS.pending),
  };
}
