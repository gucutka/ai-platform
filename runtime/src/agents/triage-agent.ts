import type { AgentModule } from "./types.js";

export const triageAgent: AgentModule = {
  agentId: "triage-agent",
  outputContract: "TriageResult",
  skillIds: { core: ["github-integration"], sdlc: ["issue-triage"] },
  buildOutputInstructions: () => `
Emit TriageResult@1.0 as a single \`\`\`ai-platform-contract JSON fence (no prose after).

Required fields:
- contract: "TriageResult"
- version: "1.0"
- issue_id: number (must match Issue # from ContextPack)
- classification: feature|bug|chore|spike
- complexity: S|M|L|XL
- confidence: 0.0-1.0
- routing: { area: frontend|backend|fullstack|infra|unknown, suggested_implement_agent: string }
- labels_applied: string[] (e.g. risk:low, area:backend, agent-route:planned)

Example:
\`\`\`ai-platform-contract
{
  "contract": "TriageResult",
  "version": "1.0",
  "issue_id": 1,
  "classification": "feature",
  "complexity": "S",
  "confidence": 0.85,
  "routing": { "area": "frontend", "suggested_implement_agent": "frontend-implement-agent" },
  "labels_applied": ["risk:low", "area:frontend", "agent-route:planned"]
}
\`\`\`
`,
  validateOutput(data) {
    const errs: string[] = [];
    if (!data.classification) errs.push("missing classification");
    if (!data.complexity) errs.push("missing complexity");
    return errs;
  },
};
