import type { Manifest } from "./types.js";
import type { WorkflowDecisionRecord } from "./workflow-router.js";
import { isSecurityStepRequired } from "./security.js";

export type PipelineStepType =
  | "agent"
  | "architect-gate"
  | "implement"
  | "qa-gate"
  | "pr-create"
  | "review"
  | "security";

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  stage: string;
  agentId?: string;
  skipped?: boolean;
}

/** Ordered spec chain for medium/high paths. */
const SPEC_STAGE_AGENTS: { stage: string; agentId: string }[] = [
  { stage: "requirements", agentId: "requirements-agent" },
  { stage: "design", agentId: "product-spec-agent" },
  { stage: "design", agentId: "technical-spec-agent" },
];

function skipSet(decision: WorkflowDecisionRecord): Set<string> {
  return new Set(decision.skip_stages.map((s) => s.toLowerCase()));
}

function shouldIncludeSpecStage(
  stage: string,
  agentId: string,
  skip: Set<string>,
  decision: WorkflowDecisionRecord
): boolean {
  if (decision.risk_level === "low") return false;
  if (decision.risk_level !== "medium" && decision.risk_level !== "high") {
    return false;
  }
  // Spec chain is atomic — do not run product/technical spec without requirements
  if (skip.has("design") || skip.has("discovery") || skip.has("requirements")) {
    return false;
  }
  if (skip.has(stage)) return false;
  return true;
}

/** Build ordered execution plan from WorkflowDecision + triage context. */
export function buildExecutionPlan(
  decision: WorkflowDecisionRecord,
  manifest?: Manifest
): PipelineStep[] {
  const skip = skipSet(decision);
  const steps: PipelineStep[] = [];

  steps.push({ id: "triage-agent", type: "agent", stage: "triage", agentId: "triage-agent" });
  steps.push({
    id: "workflow-agent",
    type: "agent",
    stage: "workflow",
    agentId: "workflow-agent",
  });

  for (const spec of SPEC_STAGE_AGENTS) {
    if (!shouldIncludeSpecStage(spec.stage, spec.agentId, skip, decision)) {
      continue;
    }
    steps.push({
      id: spec.agentId,
      type: "agent",
      stage: spec.stage,
      agentId: spec.agentId,
    });
    if (spec.agentId === "product-spec-agent") {
      steps.push({
        id: "architect-gate",
        type: "architect-gate",
        stage: "architect-gate",
      });
    }
  }

  steps.push({ id: "plan-agent", type: "agent", stage: "plan", agentId: "plan-agent" });
  steps.push({ id: "implement", type: "implement", stage: "implementation" });

  // CI gate — always run (deterministic verification), even if skip_stages lists qa
  steps.push({ id: "qa-gate", type: "qa-gate", stage: "verification" });

  steps.push({ id: "pr-create", type: "pr-create", stage: "merge" });

  if (
    !skip.has("architecture-review") &&
    decision.sdlc_path.includes("architecture-review") &&
    decision.risk_level !== "low"
  ) {
    steps.push({
      id: "architecture-review-agent",
      type: "agent",
      stage: "architecture-review",
      agentId: "architecture-review-agent",
    });
  }

  steps.push({
    id: "review-agent",
    type: "review",
    stage: "review",
    agentId: "review-agent",
  });

  if (
    manifest &&
    isSecurityStepRequired({ manifest, workflowDecision: decision })
  ) {
    steps.push({
      id: "security-agent",
      type: "security",
      stage: "security",
      agentId: "security-agent",
    });
  }

  return steps;
}

export function describeExecutionPlan(steps: PipelineStep[]): string {
  return steps
    .map((s, i) => {
      const name = s.agentId ?? s.id;
      const label = name.replace(/-agent$/, "").replace(/-/g, " ");
      const skip = s.skipped ? " _(skipped)_" : "";
      return `${i + 1}. **${label}** — \`${s.stage}\`${skip}`;
    })
    .join("\n");
}
