import type { AgentModule } from "./types.js";

export const requirementsAgent: AgentModule = {
  agentId: "requirements-agent",
  outputContract: "BusinessRequirements",
  skillIds: { sdlc: ["user-story-format"] },
  buildOutputInstructions: () => `
Emit BusinessRequirements@1.0 from the issue acceptance criteria and knowledge docs.

Required fields:
- issue_id (match Issue #)
- summary: one paragraph business goal
- acceptance_criteria: string[] — copy/refine from issue AC section (each testable)
- status: "draft"

Example:
\`\`\`ai-platform-contract
{
  "contract": "BusinessRequirements",
  "version": "1.0",
  "issue_id": 1,
  "summary": "Allow users to toggle todo completion via PATCH.",
  "acceptance_criteria": [
    "PATCH /api/todos/:id with { done: true } returns 200 with updated item",
    "Unknown id returns 404 with { error: not found }"
  ],
  "status": "draft"
}
\`\`\`
`,
  validateOutput(data) {
    const errs: string[] = [];
    if (!data.summary) errs.push("summary required");
    if (!Array.isArray(data.acceptance_criteria) || data.acceptance_criteria.length === 0) {
      errs.push("acceptance_criteria must be non-empty array");
    }
    return errs;
  },
};
