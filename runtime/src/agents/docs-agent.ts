import type { AgentModule } from "./types.js";

export const docsAgent: AgentModule = {
  agentId: "docs-agent",
  outputContract: "DocumentationResult",
  skillIds: {
    sdlc: ["release-notes-format"],
    technology: ["markdown-docs", "openapi"],
  },
  buildOutputInstructions: () => `
Emit DocumentationResult@1.0 after merge:
- issue_id (integer)
- docs_updated: string[] — paths touched (e.g. CHANGELOG.md, README.md)
- status: "draft"
- summary: one sentence user-facing summary
- changelog_entry: Keep a Changelog bullet for ### Added or ### Changed

Use ProductSpec / issue context. Do NOT propose edits under docs/knowledge/**.

Example:
\`\`\`ai-platform-contract
{
  "contract": "DocumentationResult",
  "version": "1.0",
  "issue_id": 1,
  "docs_updated": ["CHANGELOG.md", "README.md"],
  "status": "draft",
  "summary": "Added due date field to todos.",
  "changelog_entry": "Due date support on todos (REST API + UI)"
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    if (!Array.isArray(out.docs_updated)) out.docs_updated = [];
    if (!out.status) out.status = "draft";
    if (typeof out.summary !== "string" || !out.summary.trim()) {
      out.summary = "Post-merge documentation update.";
    }
    if (!out.changelog_entry) {
      out.changelog_entry = out.summary;
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    if (data.issue_id == null) errs.push("issue_id required");
    if (!Array.isArray(data.docs_updated)) errs.push("docs_updated must be array");
    if (!data.status) errs.push("status required");
    return errs;
  },
};
