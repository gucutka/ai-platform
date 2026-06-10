import type { AgentModule } from "./types.js";

export const technicalSpecAgent: AgentModule = {
  agentId: "technical-spec-agent",
  outputContract: "TechnicalDesign",
  skillIds: { sdlc: ["technical-design-format"] },
  buildOutputInstructions: () => `
Emit TechnicalDesign@1.0 from ProductSpec and repository context.

Required fields:
- issue_id
- modules: [{ name, responsibility, files[] }]
- adr_references: string[] (ADRs or "none")
- api_contracts: [{ method, path, request, response }]
- constraints: string[] (performance, security, compatibility)
- status: "draft"

Design for the existing stack in context (Express demo app unless manifest says otherwise).
`,
  validateOutput(data) {
    const errs: string[] = [];
    if (!Array.isArray(data.modules) || data.modules.length === 0) {
      errs.push("modules must be non-empty array");
    }
    if (!Array.isArray(data.adr_references)) errs.push("adr_references must be array");
    if (!Array.isArray(data.api_contracts)) errs.push("api_contracts must be array");
    return errs;
  },
};
