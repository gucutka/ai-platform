import type { AgentModule } from "./types.js";

export const handoffSummarizerAgent: AgentModule = {
  agentId: "handoff-summarizer-agent",
  outputContract: "HandoffSummary",
  skillIds: { core: ["github-integration"] },
  buildOutputInstructions: () =>
    "Compress the stage contract to ≤500 tokens. Preserve decision-critical fields in summary text.",
  validateOutput(data) {
    const errs: string[] = [];
    if (data.contract !== "HandoffSummary") errs.push("contract must be HandoffSummary");
    if (typeof data.summary !== "string" || data.summary.length < 10) {
      errs.push("summary must be at least 10 characters");
    }
    if (!Array.isArray(data.contracts_passed)) errs.push("contracts_passed required");
    return errs;
  },
};
