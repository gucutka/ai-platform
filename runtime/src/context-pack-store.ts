import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ContextPack, FileSnippet } from "./types.js";
import { getRunsDir } from "./config.js";

export interface ContextPackRef {
  path: string;
  sha256: string;
  kind: "code" | "knowledge" | "pr_diff";
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function buildContextPackRefs(files: FileSnippet[]): ContextPackRef[] {
  return files.map((f) => ({
    path: f.path,
    sha256: hashContent(f.content),
    kind: f.path.startsWith("docs/knowledge/")
      ? "knowledge"
      : f.path === "PR_DIFF.md"
        ? "pr_diff"
        : "code",
  }));
}

export function hashContextPack(pack: Omit<ContextPack, "context_pack_hash">): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        target_agent: pack.target_agent,
        tier: pack.tier,
        refs: pack.refs,
        contracts: Object.keys(pack.contracts).sort(),
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export function saveContextPackArtifact(
  projectDir: string,
  issueNumber: number,
  agentId: string,
  pack: ContextPack
): string {
  const runsPath = path.join(
    getRunsDir(projectDir),
    String(issueNumber),
    `context-pack-${agentId}.json`
  );
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(runsPath, JSON.stringify(pack, null, 2));

  const ctxDir = path.join(
    projectDir,
    ".ai-platform",
    "context",
    String(issueNumber)
  );
  fs.mkdirSync(ctxDir, { recursive: true });
  const ctxPath = path.join(ctxDir, `${agentId}.json`);
  fs.writeFileSync(ctxPath, JSON.stringify(pack, null, 2));
  return ctxPath;
}

export function loadContextPackArtifact(
  projectDir: string,
  issueNumber: number,
  agentId: string
): ContextPack | null {
  const p = path.join(
    projectDir,
    ".ai-platform",
    "context",
    String(issueNumber),
    `${agentId}.json`
  );
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ContextPack;
}
