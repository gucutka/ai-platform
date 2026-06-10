import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";

export type ContextTier = "T0" | "T1" | "T2" | "T3";

export interface RetrievalStageRule {
  layers?: string[];
  top_k?: number;
  code_graph?: boolean;
  include_adrs?: string;
  code?: "diff_only" | "test_files_only";
}

export interface RetrievalStrategy {
  version: string;
  stages: Record<string, RetrievalStageRule>;
}

const AGENT_TIER: Record<string, ContextTier> = {
  "triage-agent": "T0",
  "workflow-agent": "T0",
  "context-builder-agent": "T0",
  "contract-validator-agent": "T0",
  "handoff-summarizer-agent": "T0",
  "requirements-agent": "T1",
  "product-spec-agent": "T1",
  "technical-spec-agent": "T1",
  "plan-agent": "T1",
  "release-agent": "T1",
  "docs-agent": "T1",
  "frontend-implement-agent": "T2",
  "backend-implement-agent": "T2",
  "fullstack-implement-agent": "T2",
  "infra-implement-agent": "T2",
  "review-agent": "T2",
  "qa-agent": "T2",
  "security-agent": "T2",
  "architecture-review-agent": "T2",
  "migration-agent": "T3",
};

const AGENT_STAGE: Record<string, string> = {
  "triage-agent": "triage",
  "workflow-agent": "triage",
  "requirements-agent": "requirements",
  "product-spec-agent": "design",
  "technical-spec-agent": "design",
  "plan-agent": "design",
  "frontend-implement-agent": "implementation",
  "backend-implement-agent": "implementation",
  "fullstack-implement-agent": "implementation",
  "infra-implement-agent": "implementation",
  "architecture-review-agent": "architecture-review",
  "review-agent": "review",
  "qa-agent": "qa",
  "migration-agent": "design",
};

let strategyCache: RetrievalStrategy | null = null;

export function loadRetrievalStrategy(): RetrievalStrategy {
  if (strategyCache) return strategyCache;
  const file = path.join(getPlatformRoot(), "context", "rules", "retrieval-strategy.yaml");
  strategyCache = YAML.parse(fs.readFileSync(file, "utf8")) as RetrievalStrategy;
  return strategyCache;
}

export function resolveAgentTier(agentId: string): ContextTier {
  return AGENT_TIER[agentId] ?? "T2";
}

export function resolveAgentStage(agentId: string): string {
  return AGENT_STAGE[agentId] ?? "implementation";
}

export function resolveRetrievalRule(agentId: string): RetrievalStageRule {
  const strategy = loadRetrievalStrategy();
  const stage = resolveAgentStage(agentId);
  return strategy.stages[stage] ?? { layers: ["technical", "code"], top_k: 12 };
}

export function resolveKnowledgeLayers(agentId: string): string[] {
  const rule = resolveRetrievalRule(agentId);
  return rule.layers ?? [];
}

export function resolveTopK(agentId: string): number {
  return resolveRetrievalRule(agentId).top_k ?? 12;
}

export function shouldUseCodeGraph(agentId: string): boolean {
  return resolveRetrievalRule(agentId).code_graph === true;
}

export function codeRetrievalMode(agentId: string): RetrievalStageRule["code"] | undefined {
  return resolveRetrievalRule(agentId).code;
}
