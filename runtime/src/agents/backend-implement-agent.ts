import type { AgentModule } from "./types.js";
import { PR_DESCRIPTION_INSTRUCTIONS } from "../implement-pr-instructions.js";

export const backendImplementAgent: AgentModule = {
  agentId: "backend-implement-agent",
  outputContract: "CodeChanges",
  skillIds: {
    technology: ["nestjs", "node-typescript", "fastapi", "postgres"],
  },
  buildOutputInstructions: () => `
Emit CodeChanges@1.0:
- issue_id, branch (from plan), files: [{ path, content }] FULL file contents
- summary, plan_task_coverage (0-1), self_review_passed: true

Rules:
- **Scope:** ONLY files listed in ImplementationPlan.tasks[].files — no extra files or endpoints
- Do NOT add routes, handlers, or features outside the current issue/plan (no drive-by DELETE/GET/etc.)
- When editing existing files, change only what the plan requires; preserve unrelated code
- minimal diff, no new deps unless required, no stubs/TODO
- if package.json changes → MUST include updated package-lock.json (run npm install)
- test script MUST set NODE_ENV=test when server binds a port (e.g. \`NODE_ENV=test node --test ...\`)
- include or update tests for every behavior change
${PR_DESCRIPTION_INSTRUCTIONS}
`,
  validateOutput(data) {
    const errs: string[] = [];
    const pr = data.pr_description as Record<string, string> | undefined;
    if (!pr?.summary?.trim()) errs.push("pr_description.summary required");
    if (!pr?.changes?.trim()) errs.push("pr_description.changes required");
    if (!pr?.testing?.trim()) errs.push("pr_description.testing required");
    const files = data.files as { path?: string; content?: string }[];
    if (!Array.isArray(files) || files.length === 0) errs.push("files required");
    for (const f of files ?? []) {
      if (!f.path || f.content === undefined) errs.push(`invalid file entry`);
      if (f.content?.includes("// TODO") || f.content?.includes("not implemented"))
        errs.push(`stub in ${f.path}`);
    }
    if (data.self_review_passed !== true) errs.push("self_review_passed must be true");
    return errs;
  },
};
