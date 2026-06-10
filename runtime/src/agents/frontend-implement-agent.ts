import type { AgentModule } from "./types.js";
import { PR_DESCRIPTION_INSTRUCTIONS } from "../implement-pr-instructions.js";

export const frontendImplementAgent: AgentModule = {
  agentId: "frontend-implement-agent",
  outputContract: "CodeChanges",
  skillIds: {
    technology: ["react", "nextjs", "storybook"],
  },
  buildOutputInstructions: () => `
Emit CodeChanges@1.0 with full files. Include a11y (labels, roles). Match repo styling.
self_review_passed: true required. plan_task_coverage >= 0.9.

Rules:
- **Scope:** ONLY files from ImplementationPlan.tasks — no extra files or features
- Do NOT add unrelated routes/components outside the plan
- no stubs/TODO; include tests for behavior changes
- if package.json changes → include package-lock.json
- test scripts: use NODE_ENV=test when needed for test runs
${PR_DESCRIPTION_INSTRUCTIONS}
`,
  validateOutput(data) {
    const errs: string[] = [];
    const pr = data.pr_description as Record<string, string> | undefined;
    if (!pr?.summary?.trim()) errs.push("pr_description.summary required");
    if (!pr?.changes?.trim()) errs.push("pr_description.changes required");
    if (!pr?.testing?.trim()) errs.push("pr_description.testing required");
    const files = data.files as { content?: string }[];
    if (!files?.length) errs.push("files required");
    if (data.self_review_passed !== true) errs.push("self_review required");
    return errs;
  },
};
