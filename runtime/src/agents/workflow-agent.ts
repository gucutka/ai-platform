import type { AgentModule } from "./types.js";

export const workflowAgent: AgentModule = {
  agentId: "workflow-agent",
  outputContract: "WorkflowDecision",
  skillIds: { core: ["github-integration"] },
  buildOutputInstructions: () => `
Emit WorkflowDecision@1.0 from TriageResult and routing-rules (in context).

Required fields:
- issue_id (match Issue #)
- risk_level: low|medium|high
- review_level: light|standard|strict
- sdlc_path: string[] (stages for this issue)
- mandatory_agents: string[] (agent ids to run)
- skip_stages: string[] (e.g. discovery, design, qa, security)
- human_gates: string[] (labels, e.g. human-review:required)

Low-risk chore/S complexity → skip discovery, design, security.
Medium/high → **do not** put discovery or design in skip_stages; spec agents run in order.
High → full path, strict review, human_gates.

Example:
\`\`\`ai-platform-contract
{
  "contract": "WorkflowDecision",
  "version": "1.0",
  "issue_id": 1,
  "risk_level": "low",
  "review_level": "light",
  "sdlc_path": ["implementation", "review", "merge"],
  "mandatory_agents": ["plan-agent", "backend-implement-agent", "review-agent"],
  "skip_stages": ["discovery", "design", "qa", "security"],
  "human_gates": []
}
\`\`\`
`,
  validateOutput(data) {
    const errs: string[] = [];
    if (!data.risk_level) errs.push("risk_level required");
    if (!Array.isArray(data.sdlc_path)) errs.push("sdlc_path must be array");
    if (!Array.isArray(data.skip_stages)) errs.push("skip_stages must be array");
    return errs;
  },
};
