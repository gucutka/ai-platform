/** Shared Slack mrkdwn rules for conversation agents (not GitHub markdown). */
export const SLACK_REPLY_FORMAT = `
### Slack reply formatting (required)

Replies are shown in Slack threads. Use **Slack mrkdwn**, not GitHub markdown.

Allowed:
- *bold* (single asterisks — never **double**)
- _italic_
- \`inline code\`
- \`\`\`code blocks\`\`\`
- Bullets: start lines with • or -
- Section titles: *Title* on its own line, blank line after
- Numbered lists: \`1.\` \`2.\` at line start
- Links: \`<https://example.com|label>\` or bare URL

Forbidden in \`reply\`:
- ## / ### headers
- Markdown tables (\`| col |\`)
- **double-asterisk bold**
- Horizontal rules (\`---\`)

Keep replies scannable: short paragraphs, blank lines between sections, no walls of text.
`.trim();
