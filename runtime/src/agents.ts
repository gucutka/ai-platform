import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { RuntimeAgentDef } from "./types.js";
import { getPlatformRoot } from "./config.js";

export const IMPLEMENT_AGENT_IDS = [
  "frontend-implement-agent",
  "backend-implement-agent",
  "fullstack-implement-agent",
  "infra-implement-agent",
] as const;

export type ImplementAgentId = (typeof IMPLEMENT_AGENT_IDS)[number];

const VALID_IMPLEMENT_AGENTS = new Set<string>(IMPLEMENT_AGENT_IDS);

export function isImplementAgent(agentId: string): agentId is ImplementAgentId {
  return VALID_IMPLEMENT_AGENTS.has(agentId);
}

export function loadRuntimeDef(agentId: string): RuntimeAgentDef {
  const p = path.join(
    getPlatformRoot(),
    "runtime/config/agents",
    `${agentId}.runtime.yaml`
  );
  if (!fs.existsSync(p)) {
    throw new Error(`Runtime definition not found: ${p}`);
  }
  const parsed = YAML.parse(fs.readFileSync(p, "utf8")) as RuntimeAgentDef;
  return {
    ...parsed,
    retry: {
      max_attempts: parsed.retry?.max_attempts ?? 3,
      backoff_ms: parsed.retry?.backoff_ms ?? [1000, 5000, 15000],
    },
  };
}

export function loadAgentPrompt(agentId: string): string {
  const categories = ["meta", "sdlc", "on-demand"];
  for (const cat of categories) {
    const p = path.join(getPlatformRoot(), "agents", cat, agentId, "prompt.md");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return `# ${agentId}\nExecute your stage and emit the required contract.`;
}

export function getOutputContractName(outputContract: string): string {
  return outputContract.split("@")[0];
}

/** Route implement agent from triage routing, suggested agent, or issue labels. */
export function resolveImplementAgent(
  triage: Record<string, unknown>,
  labels?: string[]
): ImplementAgentId {
  const routing = triage.routing as
    | { area?: string; suggested_implement_agent?: string }
    | undefined;

  const suggested = routing?.suggested_implement_agent;
  if (suggested && isImplementAgent(suggested)) {
    return suggested;
  }

  const area =
    routing?.area ??
    (triage as { area?: string }).area ??
    inferAreaFromLabels(triage, labels);

  switch (String(area).toLowerCase()) {
    case "backend":
      return "backend-implement-agent";
    case "infra":
      return "infra-implement-agent";
    case "fullstack":
      return "fullstack-implement-agent";
    case "frontend":
      return "frontend-implement-agent";
    default:
      return "frontend-implement-agent";
  }
}

function inferAreaFromLabels(
  triage: Record<string, unknown>,
  labels?: string[]
): string {
  const combined = [
    ...((triage.labels_applied as string[]) ?? []),
    ...(labels ?? []),
  ].map((l) => l.toLowerCase());

  if (combined.some((l) => l.includes("fullstack") || l === "area:fullstack")) {
    return "fullstack";
  }
  if (combined.some((l) => l.includes("infra") || l === "area:infra")) {
    return "infra";
  }
  if (combined.some((l) => l.includes("backend") || l === "area:backend")) {
    return "backend";
  }
  if (combined.some((l) => l.includes("frontend") || l === "area:frontend")) {
    return "frontend";
  }
  return "frontend";
}
