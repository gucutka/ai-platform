import type { AgentModule } from "./types.js";
import { PR_DESCRIPTION_INSTRUCTIONS } from "../implement-pr-instructions.js";

export const infraImplementAgent: AgentModule = {
  agentId: "infra-implement-agent",
  outputContract: "CodeChanges",
  skillIds: { technology: ["terraform", "aws", "docker"] },
  buildOutputInstructions: () =>
    `Emit CodeChanges@1.0 for IaC/CI only (.github, docker, terraform). No application logic.
- issue_id, branch (from plan), files: [{ path, content }]
- summary, self_review_passed: true
${PR_DESCRIPTION_INSTRUCTIONS}`,
  validateOutput(data) {
    const errs: string[] = [];
    const pr = data.pr_description as Record<string, string> | undefined;
    if (!pr?.summary?.trim()) errs.push("pr_description.summary required");
    if (!pr?.changes?.trim()) errs.push("pr_description.changes required");
    if (!pr?.testing?.trim()) errs.push("pr_description.testing required");
    const files = data.files as { path?: string; content?: string }[];
    if (!files?.length) return ["files required"];
    if (data.self_review_passed !== true) errs.push("self_review_passed must be true");
    return errs;
  },
};
