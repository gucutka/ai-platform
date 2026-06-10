import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";
import type { FileSnippet } from "./types.js";

const MAX_KNOWLEDGE_BYTES = 8000;
const MAX_KNOWLEDGE_FILES = 6;

/** Blueprint layers → project docs/knowledge/{layer}/** */
export const KNOWLEDGE_LAYERS_BY_AGENT: Record<string, string[]> = {
  "requirements-agent": ["business"],
  "product-spec-agent": ["business", "product"],
  "technical-spec-agent": ["product", "technical"],
  "plan-agent": ["product", "technical"],
  "triage-agent": ["business"],
};

export async function loadKnowledgeDocs(
  projectDir: string,
  layers: string[]
): Promise<FileSnippet[]> {
  const snippets: FileSnippet[] = [];
  const seen = new Set<string>();

  for (const layer of layers) {
    const base = path.join(projectDir, "docs", "knowledge", layer);
    if (!fs.existsSync(base)) continue;

    const files = await glob("**/*.{md,yaml,yml,json,txt}", {
      cwd: base,
      nodir: true,
      ignore: ["**/node_modules/**"],
    });

    for (const rel of files) {
      if (snippets.length >= MAX_KNOWLEDGE_FILES) return snippets;
      const full = path.join(base, rel);
      const displayPath = `docs/knowledge/${layer}/${rel}`;
      if (seen.has(displayPath)) continue;
      seen.add(displayPath);

      let content = fs.readFileSync(full, "utf8");
      if (content.length > MAX_KNOWLEDGE_BYTES) {
        content = content.slice(0, MAX_KNOWLEDGE_BYTES) + "\n\n<!-- truncated -->";
      }
      snippets.push({ path: displayPath, content });
    }
  }

  return snippets;
}
