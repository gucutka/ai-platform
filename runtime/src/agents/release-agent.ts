import type { AgentModule } from "./types.js";

export const releaseAgent: AgentModule = {
  agentId: "release-agent",
  outputContract: "ReleaseResult",
  skillIds: { sdlc: ["release-notes-format"] },
  buildOutputInstructions: () => `
Emit ReleaseResult@1.0 (draft tag — human approval required before publish):
- issue_id (integer)
- version: semver string (patch bump unless breaking change in docs)
- tag: e.g. v1.2.3
- status: "draft"
- release_notes: markdown section for GitHub Release

Use DocumentationResult.changelog_entry when present.

Example:
\`\`\`ai-platform-contract
{
  "contract": "ReleaseResult",
  "version": "1.0",
  "issue_id": 1,
  "tag": "v1.0.1",
  "status": "draft",
  "release_notes": "## What's new\\n- Due date on todos"
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    if (!out.status) out.status = "draft";
    const ver = String(out.version ?? "");
    if (ver && !String(out.tag ?? "").startsWith("v")) {
      out.tag = `v${ver}`;
    }
    if (!out.release_notes && out.version) {
      out.release_notes = `Release ${out.tag ?? out.version}`;
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    if (data.issue_id == null) errs.push("issue_id required");
    if (!data.version) errs.push("version required");
    if (!data.tag) errs.push("tag required");
    if (!data.status) errs.push("status required");
    return errs;
  },
};
