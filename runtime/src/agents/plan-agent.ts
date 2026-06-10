import type { AgentModule } from "./types.js";

export const planAgent: AgentModule = {
  agentId: "plan-agent",
  outputContract: "ImplementationPlan",
  skillIds: { sdlc: ["implementation-planning"] },
  buildOutputInstructions: () => `
Emit ImplementationPlan@1.0:
- issue_id, branch_name (feat/{id}-slug)
- tasks: [{ id, description, files: string[], stack: frontend|backend|fullstack|infra, order }]
- token_budget_reserved (number)
- runtime: cloud-agent|claude-code

When upstream contracts include BusinessRequirements, ProductSpec, TechnicalDesign — align tasks with TechnicalDesign.modules and api_contracts.
Every task MUST list concrete file paths from context (only files you will change).
`,
  validateOutput(data) {
    const tasks = data.tasks as unknown[];
    if (!Array.isArray(tasks) || tasks.length === 0) return ["tasks must be non-empty"];
    return [];
  },
};
