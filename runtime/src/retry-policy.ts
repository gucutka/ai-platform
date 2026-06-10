import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import type { RuntimeAgentDef } from "./types.js";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number[];
  source: "validation-rules" | "runtime-def" | "merged";
}

export function resolveRetryPolicy(def: RuntimeAgentDef): RetryPolicy {
  const runtimeMax = def.retry?.max_attempts ?? 3;
  const runtimeBackoff = def.retry?.backoff_ms ?? [1000, 5000, 15000];

  const rulesPath = path.join(getPlatformRoot(), "contracts/rules/validation-rules.yaml");
  let rulesMax = runtimeMax;
  if (fs.existsSync(rulesPath)) {
    const raw = YAML.parse(fs.readFileSync(rulesPath, "utf8")) as {
      deterministic?: { max_retries?: number };
    };
    if (typeof raw.deterministic?.max_retries === "number") {
      rulesMax = raw.deterministic.max_retries;
    }
  }

  const maxAttempts = Math.min(runtimeMax, rulesMax);
  return {
    maxAttempts,
    backoffMs: runtimeBackoff,
    source: maxAttempts === runtimeMax ? "runtime-def" : "merged",
  };
}

export async function sleepWithBackoff(
  backoffMs: number[],
  attempt: number
): Promise<void> {
  const delay = backoffMs[attempt - 1] ?? 1000 * attempt;
  await new Promise((r) => setTimeout(r, delay));
}
