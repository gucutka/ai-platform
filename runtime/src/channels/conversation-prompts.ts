import fs from "node:fs";
import path from "node:path";

// Conversation agents are driven by their canonical `.agent.yaml` `system`
// prompts (cloud-agents/agents/*-conversation-agent.agent.yaml) via the
// MCP runtime. This module only provides context-assembly helpers.

export function loadConversationHistory(
  projectDir: string,
  sessionId: string,
  limit = 10
): { role: "user" | "assistant"; content: string }[] {
  const p = path.join(projectDir, ".ai-platform", "channel-sessions", `${sessionId}.history.jsonl`);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line) as { role: "user" | "assistant"; content: string });
}

export function appendConversationHistory(
  projectDir: string,
  sessionId: string,
  userText: string,
  assistantReply: string
): void {
  const dir = path.join(projectDir, ".ai-platform", "channel-sessions");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${sessionId}.history.jsonl`);
  fs.appendFileSync(
    p,
    `${JSON.stringify({ role: "user", content: userText })}\n${JSON.stringify({ role: "assistant", content: assistantReply })}\n`
  );
}

export function formatHistoryForPrompt(
  history: { role: string; content: string }[]
): string {
  if (!history.length) return "";
  return (
    "### Prior conversation\n\n" +
    history.map((h) => `**${h.role}:** ${h.content}`).join("\n\n")
  );
}

export function loadKnowledgeSnippet(projectDir: string, layer: string, maxChars = 4000): string {
  const base = path.join(projectDir, "docs", "knowledge", layer);
  if (!fs.existsSync(base)) return "";
  const parts: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (parts.join("").length > maxChars) return;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full, `${prefix}${name}/`);
        continue;
      }
      if (!name.endsWith(".md")) continue;
      parts.push(`#### ${prefix}${name}\n${fs.readFileSync(full, "utf8").slice(0, 800)}`);
    }
  };
  walk(base, "");
  return parts.length ? `### Existing ${layer} knowledge\n\n${parts.join("\n\n")}` : "";
}

export function readManifestSnippet(projectDir: string): string {
  const p = path.join(projectDir, ".ai-platform", "manifest.yaml");
  if (!fs.existsSync(p)) return "";
  return `### Project manifest\n\`\`\`yaml\n${fs.readFileSync(p, "utf8").slice(0, 1500)}\n\`\`\``;
}
