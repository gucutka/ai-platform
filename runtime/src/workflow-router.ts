import { loadRoutingRules, type RoutingPathDef, type RoutingRules } from "./routing-loader.js";
import { loadRuntimeDef } from "./agents.js";
import { applyTierToWorkflowDecision } from "./tier-presets.js";
import type { Manifest } from "./types.js";

export interface WorkflowDecisionRecord {
  contract: "WorkflowDecision";
  version: "1.0";
  issue_id: number;
  risk_level: "low" | "medium" | "high";
  review_level: "standard" | "strict" | "light";
  sdlc_path: string[];
  mandatory_agents: string[];
  skip_stages: string[];
  human_gates: string[];
  path_key: string;
  routing_source: "deterministic" | "workflow-agent";
}

export function inferRiskLevel(
  triage: Record<string, unknown>,
  labels: string[]
): "low" | "medium" | "high" {
  if (labels.some((l) => l === "risk:high")) return "high";
  if (labels.some((l) => l === "risk:medium")) return "medium";
  if (labels.some((l) => l === "risk:low")) return "low";

  const classification = String(triage.classification ?? "").toLowerCase();
  const complexity = String(triage.complexity ?? "S").toUpperCase();

  if (classification === "chore" || classification === "spike") return "low";
  if (complexity === "S") return "low";
  if (complexity === "M") return "medium";
  if (complexity === "L" || complexity === "XL") return "high";
  return "low";
}

function pathKeyForRisk(risk: "low" | "medium" | "high"): keyof RoutingRules["paths"] {
  if (risk === "high") return "high_risk";
  if (risk === "medium") return "medium_feature";
  return "low_risk";
}

function filterEnabledAgents(agents: string[]): string[] {
  return agents.filter((id) => {
    try {
      return loadRuntimeDef(id).enabled;
    } catch {
      return false;
    }
  });
}

export function buildDeterministicWorkflowDecision(opts: {
  issueId: number;
  triage: Record<string, unknown>;
  labels: string[];
  manifest?: Manifest;
}): WorkflowDecisionRecord {
  const rules = loadRoutingRules();
  const risk = inferRiskLevel(opts.triage, opts.labels);
  const pathKey = pathKeyForRisk(risk);
  const pathDef: RoutingPathDef = rules.paths[pathKey];

  let mandatory: string[];
  if (pathDef.mandatory_agents === "all_sdlc") {
    mandatory = [
      "requirements-agent",
      "product-spec-agent",
      "technical-spec-agent",
      "plan-agent",
      "frontend-implement-agent",
      "backend-implement-agent",
      "architecture-review-agent",
      "review-agent",
      "qa-agent",
      "security-agent",
    ];
  } else {
    mandatory = pathDef.mandatory_agents;
  }

  const enabledMandatory = filterEnabledAgents(mandatory);

  let decision: WorkflowDecisionRecord = {
    contract: "WorkflowDecision",
    version: "1.0",
    issue_id: opts.issueId,
    risk_level: risk,
    review_level:
      pathDef.review_level === "strict"
        ? "strict"
        : risk === "low"
          ? "light"
          : "standard",
    sdlc_path: [...pathDef.sdlc_path],
    mandatory_agents: enabledMandatory,
    skip_stages: [...(pathDef.skip_stages ?? [])],
    human_gates: risk === "high" ? ["human-review:required"] : [],
    path_key: pathKey,
    routing_source: "deterministic",
  };

  if (opts.manifest) {
    const tiered = applyTierToWorkflowDecision(opts.manifest, decision);
    decision = {
      ...decision,
      risk_level: tiered.risk_level as WorkflowDecisionRecord["risk_level"],
      skip_stages: tiered.skip_stages,
      human_gates: tiered.human_gates,
      mandatory_agents: tiered.mandatory_agents,
    };
  }

  return decision;
}

export function sanitizeWorkflowSkipStages(
  risk: WorkflowDecisionRecord["risk_level"],
  skipStages: string[]
): string[] {
  if (risk === "medium" || risk === "high") {
    return skipStages.filter(
      (s) => !["discovery", "design", "requirements"].includes(s.toLowerCase())
    );
  }
  return skipStages;
}

export function normalizeWorkflowDecision(
  data: Record<string, unknown>,
  issueId: number,
  fallback: WorkflowDecisionRecord
): WorkflowDecisionRecord {
  const risk = String(data.risk_level ?? fallback.risk_level).toLowerCase();
  const validRisk =
    risk === "high" || risk === "medium" || risk === "low"
      ? risk
      : fallback.risk_level;

  let skipStages = Array.isArray(data.skip_stages)
    ? (data.skip_stages as string[])
    : fallback.skip_stages;

  // Medium/high must run full spec chain — ignore discovery/design skips from LLM
  if (validRisk === "medium" || validRisk === "high") {
    skipStages = sanitizeWorkflowSkipStages(validRisk, skipStages);
  }

  return {
    contract: "WorkflowDecision",
    version: "1.0",
    issue_id: issueId,
    risk_level: validRisk,
    review_level:
      data.review_level === "strict" || data.review_level === "light"
        ? (data.review_level as WorkflowDecisionRecord["review_level"])
        : fallback.review_level,
    sdlc_path: Array.isArray(data.sdlc_path)
      ? (data.sdlc_path as string[])
      : fallback.sdlc_path,
    mandatory_agents: Array.isArray(data.mandatory_agents)
      ? filterEnabledAgents(data.mandatory_agents as string[])
      : fallback.mandatory_agents,
    skip_stages: skipStages,
    human_gates: Array.isArray(data.human_gates)
      ? (data.human_gates as string[])
      : fallback.human_gates,
    path_key: String(data.path_key ?? fallback.path_key),
    routing_source: "workflow-agent",
  };
}
