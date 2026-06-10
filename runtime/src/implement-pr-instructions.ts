/** Shared implement-agent instructions for rich PR descriptions. */
export const PR_DESCRIPTION_INSTRUCTIONS = `
## PR description (required)

Include \`pr_description\` in CodeChanges@1.0 — markdown-friendly strings for the GitHub PR body:

\`\`\`json
"pr_description": {
  "summary": "One sentence: what this PR delivers.",
  "changes": "- Bullet list of concrete changes\\n- Group by area if helpful",
  "testing": "- How to verify locally\\n- Commands run (e.g. npm test)",
  "notes": "Optional: risks, follow-ups, out-of-scope"
}
\`\`\`

Rules:
- Write for humans reviewing the PR — clear, complete sentences
- \`changes\`: use markdown bullets; mention files only when it helps the reader
- \`testing\`: copy-pasteable steps; state what you ran or expect CI to run
- Do not paste full file contents into pr_description
- Keep \`summary\` (top-level string field) aligned with pr_description.summary
`;
