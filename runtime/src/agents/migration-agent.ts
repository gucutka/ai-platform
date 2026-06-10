import type { AgentModule } from "./types.js";

export const migrationAgent: AgentModule = {
  agentId: "migration-agent",
  outputContract: "MigrationPlan",
  skillIds: { sdlc: ["technical-design-format"], technology: ["terraform"] },
  buildOutputInstructions: () => `
Emit MigrationPlan@1.0 (on-demand — no full SDLC required):
- issue_id, risk_level: low|medium|high
- summary: string
- steps: [{ id, description, files?: string[], rollback?, order }]
- prerequisites?: string[]
- escalation_recommended?: boolean

Plan only — do NOT emit CodeChanges. Architect + Tech Lead review required before execution.

Example:
\`\`\`ai-platform-contract
{
  "contract": "MigrationPlan",
  "version": "1.0",
  "issue_id": 1,
  "risk_level": "medium",
  "summary": "Migrate auth module to JWT",
  "steps": [
    { "id": "1", "description": "Add migration script", "order": 1 }
  ]
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    if (!Array.isArray(out.steps)) out.steps = [];
    if (typeof out.summary !== "string" || !out.summary.trim()) {
      out.summary = `Migration plan with ${(out.steps as unknown[]).length} step(s)`;
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    const steps = data.steps as unknown[];
    if (!Array.isArray(steps) || steps.length === 0) errs.push("steps required");
    const risk = String(data.risk_level ?? "").toLowerCase();
    if (!["low", "medium", "high"].includes(risk)) {
      errs.push("risk_level must be low, medium, or high");
    }
    return errs;
  },
};
