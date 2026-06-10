import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { minimatch } from "minimatch";
import { getPlatformRoot } from "./config.js";
import type { ContextTier } from "./retrieval-policy.js";

/** Token limits per tier — from context/packs/ContextPack.v1.spec.yaml */
const TIER_TOKEN_LIMITS: Record<ContextTier, number> = {
  T0: 2000,
  T1: 7000,
  T2: 16000,
  T3: 28000,
};

const BLOCK_PATH_GLOBS = [".env", "**/secrets/**", "**/vendor/**", "**/node_modules/**"];

export interface ContextBudgetLimits {
  tier: ContextTier;
  max_tokens: number;
  max_files: number;
  max_file_bytes: number;
  max_knowledge_files: number;
}

export interface TokenBudgetRules {
  version: string;
  cache?: { context_pack_ttl?: number; reuse_on_retry?: boolean };
}

let rulesCache: TokenBudgetRules | null = null;

export function loadTokenBudgetRules(): TokenBudgetRules {
  if (rulesCache) return rulesCache;
  const file = path.join(getPlatformRoot(), "context", "rules", "token-budget-rules.yaml");
  rulesCache = YAML.parse(fs.readFileSync(file, "utf8")) as TokenBudgetRules;
  return rulesCache;
}

export function resolveContextBudget(agentId: string, tier: ContextTier, topK: number): ContextBudgetLimits {
  const maxTokens = TIER_TOKEN_LIMITS[tier];
  const maxFiles = Math.min(topK, tier === "T0" ? 5 : tier === "T1" ? 10 : tier === "T2" ? 20 : 30);
  const maxFileBytes = Math.max(
    2000,
    Math.floor((maxTokens * 4) / Math.max(maxFiles, 1))
  );
  return {
    tier,
    max_tokens: maxTokens,
    max_files: maxFiles,
    max_file_bytes: Math.min(maxFileBytes, tier === "T0" ? 4000 : 12000),
    max_knowledge_files: tier === "T0" ? 3 : tier === "T1" ? 6 : 8,
  };
}

export function isBlockedPath(filePath: string): boolean {
  return BLOCK_PATH_GLOBS.some((pat) => minimatch(filePath, pat, { dot: true }));
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

export function compressToTokenBudget(
  promptText: string,
  maxTokens: number
): { text: string; estimated_tokens: number; compressed: boolean } {
  const estimated = estimateTokensFromText(promptText);
  if (estimated <= maxTokens) {
    return { text: promptText, estimated_tokens: estimated, compressed: false };
  }
  const maxChars = maxTokens * 4;
  return {
    text: promptText.slice(0, maxChars) + "\n\n<!-- context truncated to tier token budget -->",
    estimated_tokens: maxTokens,
    compressed: true,
  };
}
