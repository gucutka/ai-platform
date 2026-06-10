import { formatKeyValueTable, machineMarker } from "./comment-format.js";
import type { GitHubClient } from "./github.js";
import type { CostReport } from "./cost-report.js";
import type { Manifest } from "./types.js";
import { buildCostReport } from "./cost-report.js";
import { estimateUsd, getIssueTokenUsage, type IssueTokenUsage } from "./token-budget.js";

export interface CostAlertThreshold {
  threshold_percent: number;
  action: string;
  label: string;
}

export const COST_ALERT_THRESHOLDS: CostAlertThreshold[] = [
  { threshold_percent: 70, action: "warn_tech_lead", label: "cost:warn" },
  { threshold_percent: 90, action: "require_em_approval", label: "cost:critical" },
  { threshold_percent: 100, action: "block_dispatch", label: "cost:blocked" },
];

export interface CostAlertResult {
  triggered: CostAlertThreshold | null;
  used_percent: number;
  monthly_usd: number;
  current_usd: number;
  block_dispatch: boolean;
}

export function evaluateMonthlyCostAlerts(
  manifest: Manifest,
  report: CostReport
): CostAlertResult {
  const monthlyUsd = manifest.token_budget?.monthly_usd ?? report.budget?.monthly_usd;
  if (!monthlyUsd || monthlyUsd <= 0) {
    return {
      triggered: null,
      used_percent: 0,
      monthly_usd: 0,
      current_usd: report.totals.usd,
      block_dispatch: false,
    };
  }

  const usedPercent = (report.totals.usd / monthlyUsd) * 100;
  let triggered: CostAlertThreshold | null = null;
  for (const t of [...COST_ALERT_THRESHOLDS].reverse()) {
    if (usedPercent >= t.threshold_percent) {
      triggered = t;
      break;
    }
  }

  return {
    triggered,
    used_percent: Math.round(usedPercent * 10) / 10,
    monthly_usd: monthlyUsd,
    current_usd: report.totals.usd,
    block_dispatch: usedPercent >= 100,
  };
}

export function evaluateIssueCostAlerts(
  manifest: Manifest,
  usage: IssueTokenUsage
): CostAlertResult {
  const monthlyUsd = manifest.token_budget?.monthly_usd;
  if (!monthlyUsd) {
    return {
      triggered: null,
      used_percent: 0,
      monthly_usd: 0,
      current_usd: usage.estimated_usd,
      block_dispatch: false,
    };
  }
  const usedPercent = (usage.estimated_usd / monthlyUsd) * 100;
  let triggered: CostAlertThreshold | null = null;
  for (const t of [...COST_ALERT_THRESHOLDS].reverse()) {
    if (usedPercent >= t.threshold_percent) {
      triggered = t;
      break;
    }
  }
  return {
    triggered,
    used_percent: Math.round(usedPercent * 10) / 10,
    monthly_usd: monthlyUsd,
    current_usd: usage.estimated_usd,
    block_dispatch: usedPercent >= 100,
  };
}

export function formatCostAlertComment(
  alert: CostAlertResult,
  context: "monthly" | "issue",
  issueId?: number
): string {
  const t = alert.triggered;
  if (!t) return "";
  const scope =
    context === "issue" && issueId != null
      ? `Issue #${issueId}`
      : "Project monthly budget";
  const actionNote =
    t.action === "require_em_approval"
      ? "Engineering manager approval is required before further agent runs."
      : t.action === "block_dispatch"
        ? "Agent dispatch is blocked until the budget resets or receives approval."
        : "";

  return [
    machineMarker("cost-alert"),
    `## Cost alert — ${t.action.replace(/_/g, " ")}`,
    formatKeyValueTable([
      ["Scope", scope],
      ["Spend", `$${alert.current_usd.toFixed(2)} / $${alert.monthly_usd}`],
      ["Used", `${alert.used_percent}%`],
      ["Threshold", `${t.threshold_percent}%`],
      ["Label applied", `\`${t.label}\``],
    ]),
    actionNote,
  ]
    .filter((s) => s.trim())
    .join("\n\n");
}

export async function applyCostAlerts(opts: {
  github: GitHubClient;
  manifest: Manifest;
  projectDir: string;
  issueNumber?: number;
  report?: CostReport;
}): Promise<CostAlertResult> {
  const report =
    opts.report ??
    buildCostReport({ projectDir: opts.projectDir, manifest: opts.manifest });
  const alert = evaluateMonthlyCostAlerts(opts.manifest, report);

  if (!alert.triggered) return alert;

  const labels = [alert.triggered.label];
  if (alert.block_dispatch) {
    labels.push("agent-route:blocked");
  }

  if (opts.issueNumber) {
    await opts.github.addLabels(opts.issueNumber, labels);
    await opts.github.addIssueComment(
      opts.issueNumber,
      formatCostAlertComment(alert, "monthly", opts.issueNumber)
    );
  }

  return alert;
}

export function checkMonthlyBudgetBlock(
  manifest: Manifest,
  projectDir: string
): { blocked: boolean; reason?: string; alert?: CostAlertResult } {
  const monthlyUsd = manifest.token_budget?.monthly_usd;
  if (!monthlyUsd) return { blocked: false };

  const report = buildCostReport({ projectDir, manifest });
  const alert = evaluateMonthlyCostAlerts(manifest, report);
  if (alert.block_dispatch) {
    return {
      blocked: true,
      reason: `Monthly token budget exceeded: $${alert.current_usd.toFixed(2)} / $${monthlyUsd}`,
      alert,
    };
  }
  return { blocked: false, alert: alert.triggered ? alert : undefined };
}

export function issueUsagePercentOfMonthly(
  manifest: Manifest,
  projectDir: string,
  issueId: number
): number {
  const monthlyUsd = manifest.token_budget?.monthly_usd;
  if (!monthlyUsd) return 0;
  const usage = getIssueTokenUsage(projectDir, issueId);
  return (usage.estimated_usd / monthlyUsd) * 100;
}
