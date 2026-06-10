import fs from "node:fs";
import path from "node:path";
import type { Manifest } from "./types.js";
import { getRunsDir } from "./config.js";

/** Rough USD estimate — aligned with governance/cost-tracking attribution. */
const DEFAULT_RATES = {
  inputPer1M: 3.0,
  outputPer1M: 15.0,
};

export interface IssueTokenUsage {
  input: number;
  output: number;
  estimated_usd: number;
}

export function estimateUsd(tokens: { input: number; output: number }): number {
  return (
    (tokens.input * DEFAULT_RATES.inputPer1M + tokens.output * DEFAULT_RATES.outputPer1M) /
    1_000_000
  );
}

export function getIssueTokenUsage(
  projectDir: string,
  issueId: number,
  sessionUsage?: { input: number; output: number }
): IssueTokenUsage {
  let input = sessionUsage?.input ?? 0;
  let output = sessionUsage?.output ?? 0;

  const runsDir = path.join(getRunsDir(projectDir), String(issueId));
  if (fs.existsSync(runsDir)) {
    for (const file of fs.readdirSync(runsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(runsDir, file), "utf8")
        ) as { usage?: { input?: number; output?: number } };
        if (data.usage) {
          input += data.usage.input ?? 0;
          output += data.usage.output ?? 0;
        }
      } catch {
        /* skip */
      }
    }
  }

  const auditDir = path.join(projectDir, ".ai-platform", "audit", String(issueId));
  const latest = path.join(auditDir, "latest.pipeline-run.json");
  if (fs.existsSync(latest)) {
    try {
      const run = JSON.parse(fs.readFileSync(latest, "utf8")) as {
        tokens_total?: { input?: number; output?: number };
      };
      if (run.tokens_total) {
        input = Math.max(input, run.tokens_total.input ?? 0);
        output = Math.max(output, run.tokens_total.output ?? 0);
      }
    } catch {
      /* skip */
    }
  }

  return { input, output, estimated_usd: estimateUsd({ input, output }) };
}

export function checkTokenBudget(
  manifest: Manifest,
  usage: IssueTokenUsage
): { allowed: boolean; limit_usd?: number; reason?: string } {
  const limit = manifest.token_budget?.per_issue_max;
  if (limit == null || limit <= 0) return { allowed: true };

  if (usage.estimated_usd > limit) {
    return {
      allowed: false,
      limit_usd: limit,
      reason: `Token budget exceeded: $${usage.estimated_usd.toFixed(2)} > $${limit} per_issue_max`,
    };
  }
  return { allowed: true, limit_usd: limit };
}

export function formatTokenBudgetEscalation(
  issueId: number,
  usage: IssueTokenUsage,
  limitUsd: number
): string {
  return `<!-- ai-platform-token-budget -->
## Token budget exceeded — dispatch blocked

Issue #${issueId} estimated spend **$${usage.estimated_usd.toFixed(2)}** exceeds \`token_budget.per_issue_max\` (**$${limitUsd}**).

Tokens: ${usage.input} in / ${usage.output} out

Label \`agent-route:blocked\` applied. Escalate to tech-lead for budget approval.`;
}
