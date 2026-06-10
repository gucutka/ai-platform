import fs from "node:fs";
import path from "node:path";
import { getPlatformRoot } from "./config.js";
import { optimizationHintForAgent } from "./optimization-loop.js";

export const QUALITY_AGENTS = [
  "backend-implement-agent",
  "frontend-implement-agent",
  "fullstack-implement-agent",
  "infra-implement-agent",
  "architecture-review-agent",
  "review-agent",
  "security-agent",
  "qa-agent",
] as const;

export type QualityAgentId = (typeof QUALITY_AGENTS)[number];

export function isQualityAgent(agentId: string): agentId is QualityAgentId {
  return (QUALITY_AGENTS as readonly string[]).includes(agentId);
}

function readIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8").trim();
}

/** Load production prompt pack from prompts/{agentId}/ */
export function loadProductionSystemPrompt(agentId: string): string {
  const root = getPlatformRoot();
  const packDir = path.join(root, "prompts", agentId);

  if (!fs.existsSync(packDir)) {
    return `# ${agentId}`;
  }

  const parts = [
    readIfExists(path.join(packDir, "system-prompt.md")),
    loadStandardsForAgent(agentId),
    readIfExists(path.join(packDir, "execution-prompt.md")),
    readIfExists(path.join(packDir, "review-checklist.md")),
    readIfExists(path.join(packDir, "failure-handling.md")),
  ].filter(Boolean);

  return parts.join("\n\n---\n\n");
}

export function loadSelfReviewPrompt(agentId: string): string {
  const p = path.join(getPlatformRoot(), "prompts", agentId, "self-review.md");
  return readIfExists(p);
}

function loadStandardsForAgent(agentId: string): string {
  const root = getPlatformRoot();
  const files: string[] = [];
  if (agentId.includes("backend")) {
    files.push("standards/backend-standards.md", "standards/testing-standards.md");
  }
  if (agentId.includes("frontend")) {
    files.push("standards/frontend-standards.md", "standards/testing-standards.md");
  }
  if (agentId === "fullstack-implement-agent") {
    files.push(
      "standards/frontend-standards.md",
      "standards/backend-standards.md",
      "standards/testing-standards.md"
    );
  }
  if (agentId === "infra-implement-agent") {
    files.push("standards/architectural-consistency-rules.md");
  }
  if (agentId === "review-agent") {
    files.push(
      "standards/review-standards.md",
      "standards/architectural-consistency-rules.md",
      "frameworks/review-excellence.md"
    );
  }
  if (agentId === "architecture-review-agent") {
    files.push("standards/architectural-consistency-rules.md");
  }
  if (agentId === "security-agent") {
    files.push("standards/review-standards.md");
  }
  if (agentId === "docs-agent" || agentId === "release-agent") {
    files.push("standards/review-standards.md");
  }
  if (agentId === "qa-agent") {
    files.push("standards/testing-standards.md", "frameworks/qa-excellence.md");
  }
  return files
    .map((f) => {
      const content = readIfExists(path.join(root, f));
      return content ? `## Standard: ${f}\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function loadArchitecturalRules(): string {
  return readIfExists(
    path.join(getPlatformRoot(), "standards", "architectural-consistency-rules.md")
  );
}

export function loadProductionSystemPromptWithOptimization(
  agentId: string,
  projectDir?: string
): string {
  const base = loadProductionSystemPrompt(agentId);
  if (!projectDir) return base;
  const hint = optimizationHintForAgent(projectDir, agentId);
  return hint ? `${base}\n\n---\n\n${hint}` : base;
}
