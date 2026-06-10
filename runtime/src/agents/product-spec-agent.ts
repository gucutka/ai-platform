import type { AgentModule } from "./types.js";

export const productSpecAgent: AgentModule = {
  agentId: "product-spec-agent",
  outputContract: "ProductSpec",
  skillIds: { sdlc: ["impact-analysis", "acceptance-criteria-mapping"] },
  buildOutputInstructions: () => `
Emit ProductSpec@1.0 from BusinessRequirements and issue context.

When \`docs/knowledge/product/\` files appear in ContextPack, cite them in \`feature_summary\` and \`dependencies\` (e.g. \`docs/knowledge/product/api-guidelines.md\`).

Required fields:
- issue_id
- feature_summary
- dependencies: string[] (APIs, modules, external systems)
- acceptance_criteria_mapped: true (every BR AC mapped to product behavior)
- status: "draft"

Map each BusinessRequirements.acceptance_criteria item to product behavior.
`,
  normalizeOutput(data) {
    const out = { ...data };
    if (out.acceptance_criteria_mapped === "true") {
      out.acceptance_criteria_mapped = true;
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    if (!data.feature_summary) errs.push("feature_summary required");
    if (!Array.isArray(data.dependencies)) errs.push("dependencies must be array");
    if (data.acceptance_criteria_mapped !== true) {
      errs.push("acceptance_criteria_mapped must be true");
    }
    return errs;
  },
};
