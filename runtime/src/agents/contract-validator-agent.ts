import type { AgentModule } from "./types.js";

export const contractValidatorAgent: AgentModule = {
  agentId: "contract-validator-agent",
  outputContract: "ValidationResult",
  skillIds: { core: ["contract-validation"] },
  buildOutputInstructions: () =>
    "Deterministic meta-agent — schema + semantic validation via Ajv. No LLM output.",
  validateOutput(data) {
    const errs: string[] = [];
    if (typeof data.valid !== "boolean") errs.push("valid must be boolean");
    if (!Array.isArray(data.errors)) errs.push("errors must be array");
    return errs;
  },
};
