import { humanAgentName } from "./comment-format.js";
import type { CodeChanges, PrDescription } from "./types.js";

function fileChangeTable(files: { path: string }[]): string {
  if (!files.length) return "_No files._";
  const rows = files.map((f) => `| \`${f.path}\` | modified |`);
  return ["| File | Change |", "|------|--------|", ...rows].join("\n");
}

function renderPrSections(desc: PrDescription): string {
  const parts: string[] = [];
  parts.push(`## Summary\n\n${desc.summary.trim()}`);
  parts.push(`## Changes\n\n${desc.changes.trim()}`);
  parts.push(`## How to test\n\n${desc.testing.trim()}`);
  if (desc.notes?.trim()) {
    parts.push(`## Notes\n\n${desc.notes.trim()}`);
  }
  return parts.join("\n\n");
}

function fallbackSections(changes: CodeChanges): string {
  const summary =
    changes.summary?.trim() ||
    `Implements the planned changes for issue #${changes.issue_id}.`;
  return [
    `## Summary\n\n${summary}`,
    `## Changes\n\n${fileChangeTable(changes.files)}`,
    `## How to test\n\n- Run project CI (\`npm test\` or manifest \`ci.test\`)\n- Verify acceptance criteria on the linked issue`,
  ].join("\n\n");
}

export function formatPullRequestBody(opts: {
  issueNumber: number;
  issueTitle?: string;
  changes: CodeChanges;
  agentId?: string;
}): string {
  const { issueNumber, issueTitle, changes, agentId } = opts;
  const titleLine = issueTitle ? `**${issueTitle}**` : `Issue #${issueNumber}`;
  const narrative = changes.pr_description
    ? renderPrSections(changes.pr_description)
    : fallbackSections(changes);

  const agentNote = agentId ? humanAgentName(agentId) : "Implement agent";

  return `Closes #${issueNumber}

${titleLine}

${narrative}

## Files changed

${fileChangeTable(changes.files)}

---

<details>
<summary>Pipeline metadata</summary>

| Field | Value |
|-------|-------|
| Issue | #${issueNumber} |
| Branch | \`${changes.branch}\` |
| Agent | ${agentNote} |

</details>
`;
}
