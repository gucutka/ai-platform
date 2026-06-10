import fs from "node:fs";
import path from "node:path";
import { formatContractDetails, formatKeyValueTable, machineMarker } from "./comment-format.js";
import { formatSkuUsageTable } from "./commercial-usage.js";
import { getProjectDir } from "./config.js";
import { estimateUsd } from "./token-budget.js";
import { aggregateUsageBySku, type SkuUsageAggregate } from "./commercial-usage.js";
import { loadCommercialConfig, resolveAgentSku } from "./commercial.js";
import type { Manifest } from "./types.js";

export interface CostLineItem {
  issue_id: number;
  run_id?: string;
  agent?: string;
  sku?: string;
  model?: string;
  tokens_in: number;
  tokens_out: number;
  usd: number;
  pr_number?: number;
  status?: string;
}

export interface CostReport {
  contract: "CostReport";
  version: "1.0";
  project_id: string;
  client?: string;
  period: string;
  generated_at: string;
  totals: {
    issues: number;
    runs: number;
    tokens_in: number;
    tokens_out: number;
    usd: number;
    merged_prs: number;
  };
  budget?: {
    monthly_usd?: number;
    used_percent?: number;
    per_issue_max?: number;
  };
  metrics: {
    burn_rate_usd_per_day: number;
    cost_per_merged_pr?: number;
    cost_per_issue_avg?: number;
  };
  by_issue: Record<
    string,
    { usd: number; tokens_in: number; tokens_out: number; pr_number?: number; status?: string }
  >;
  by_sku: Record<string, SkuUsageAggregate>;
  line_items: CostLineItem[];
  commercial?: {
    currency: string;
    billing_unit?: string;
  };
}

function auditRoot(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "audit");
}

function monthPrefix(month: string): string {
  return month.slice(0, 7);
}

function inPeriod(iso: string, month: string): boolean {
  return iso.startsWith(monthPrefix(month));
}

export function buildCostReport(opts: {
  projectDir: string;
  manifest: Manifest;
  month?: string;
}): CostReport {
  const projectDir = opts.projectDir ?? getProjectDir();
  const month = opts.month ?? new Date().toISOString().slice(0, 7);
  const lineItems: CostLineItem[] = [];
  const byIssue: CostReport["by_issue"] = {};
  let mergedPrs = 0;

  const root = auditRoot(projectDir);
  if (fs.existsSync(root)) {
    for (const issueDir of fs.readdirSync(root)) {
      const issueId = parseInt(issueDir, 10);
      if (Number.isNaN(issueId)) continue;
      const dir = path.join(root, issueDir);

      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".pipeline-run.json") || file === "latest.pipeline-run.json") {
          continue;
        }
        try {
          const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
            run_id?: string;
            issue_id?: number;
            completed_at?: string;
            started_at?: string;
            status?: string;
            pr_number?: number;
            tokens_total?: { input?: number; output?: number };
            agents?: Array<{
              agent_id: string;
              tokens?: { input?: number; output?: number };
            }>;
          };
          const ts = run.completed_at ?? run.started_at ?? "";
          if (ts && !inPeriod(ts, month)) continue;

          const tokensIn = run.tokens_total?.input ?? 0;
          const tokensOut = run.tokens_total?.output ?? 0;
          const usd = estimateUsd({ input: tokensIn, output: tokensOut });

          if (run.status === "success" && run.pr_number) mergedPrs++;

          const key = String(issueId);
          byIssue[key] = byIssue[key] ?? {
            usd: 0,
            tokens_in: 0,
            tokens_out: 0,
          };
          byIssue[key].usd += usd;
          byIssue[key].tokens_in += tokensIn;
          byIssue[key].tokens_out += tokensOut;
          byIssue[key].pr_number = run.pr_number ?? byIssue[key].pr_number;
          byIssue[key].status = run.status ?? byIssue[key].status;

          for (const agent of run.agents ?? []) {
            const ti = agent.tokens?.input ?? 0;
            const to = agent.tokens?.output ?? 0;
            if (ti + to === 0) continue;
            lineItems.push({
              issue_id: issueId,
              run_id: run.run_id,
              agent: agent.agent_id,
              sku: resolveAgentSku(agent.agent_id),
              tokens_in: ti,
              tokens_out: to,
              usd: estimateUsd({ input: ti, output: to }),
              pr_number: run.pr_number,
              status: run.status,
            });
          }

          if (!(run.agents?.length) && tokensIn + tokensOut > 0) {
            lineItems.push({
              issue_id: issueId,
              run_id: run.run_id,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              usd,
              pr_number: run.pr_number,
              status: run.status,
            });
          }
        } catch {
          /* skip corrupt */
        }
      }
    }
  }

  const totals = lineItems.reduce(
    (acc, li) => ({
      tokens_in: acc.tokens_in + li.tokens_in,
      tokens_out: acc.tokens_out + li.tokens_out,
      usd: acc.usd + li.usd,
    }),
    { tokens_in: 0, tokens_out: 0, usd: 0 }
  );

  const issueCount = Object.keys(byIssue).length;
  const runCount = new Set(lineItems.map((l) => l.run_id).filter(Boolean)).size || issueCount;
  const monthlyUsd = opts.manifest.token_budget?.monthly_usd;
  const daysInMonth = 30;
  const dayOfMonth = Math.max(1, parseInt(month.slice(8, 10) || "1", 10) || new Date().getDate());

  const bySku = aggregateUsageBySku({
    projectDir,
    month,
    lineItems,
  });

  const commercial = loadCommercialConfig();

  const report: CostReport = {
    contract: "CostReport",
    version: "1.0",
    project_id: opts.manifest.project_id,
    client: opts.manifest.client_tier,
    period: month,
    generated_at: new Date().toISOString(),
    totals: {
      issues: issueCount,
      runs: runCount,
      tokens_in: totals.tokens_in,
      tokens_out: totals.tokens_out,
      usd: totals.usd,
      merged_prs: mergedPrs,
    },
    budget: monthlyUsd
      ? {
          monthly_usd: monthlyUsd,
          used_percent: Math.round((totals.usd / monthlyUsd) * 1000) / 10,
          per_issue_max: opts.manifest.token_budget?.per_issue_max,
        }
      : { per_issue_max: opts.manifest.token_budget?.per_issue_max },
    metrics: {
      burn_rate_usd_per_day: totals.usd / dayOfMonth,
      cost_per_merged_pr: mergedPrs > 0 ? totals.usd / mergedPrs : undefined,
      cost_per_issue_avg: issueCount > 0 ? totals.usd / issueCount : undefined,
    },
    by_issue: byIssue,
    by_sku: bySku,
    line_items: lineItems,
    commercial: {
      currency: commercial.currency,
      billing_unit: commercial.billing_unit,
    },
  };

  return report;
}

export function saveCostReport(projectDir: string, report: CostReport): string {
  const dir = path.join(projectDir, ".ai-platform", "cost", report.period);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(projectDir, ".ai-platform", "cost", "latest.json"),
    JSON.stringify(report, null, 2)
  );
  return out;
}

export function formatCostReportComment(report: CostReport): string {
  const budgetRow: [string, string][] = report.budget?.monthly_usd
    ? [
        ["Monthly budget", `$${report.totals.usd.toFixed(2)} / $${report.budget.monthly_usd} (${report.budget.used_percent}%)`],
      ]
    : [];

  return [
    machineMarker("cost-report"),
    `## Cost report — ${report.period}`,
    `**Project:** \`${report.project_id}\``,
    formatKeyValueTable([
      ...budgetRow,
      ["Issues", String(report.totals.issues)],
      ["Pipeline runs", String(report.totals.runs)],
      ["Tokens", `${report.totals.tokens_in} in / ${report.totals.tokens_out} out`],
      ["Estimated USD", `$${report.totals.usd.toFixed(2)}`],
      ["Burn rate", `$${report.metrics.burn_rate_usd_per_day.toFixed(2)}/day`],
      [
        "Cost per merged PR",
        report.metrics.cost_per_merged_pr != null
          ? `$${report.metrics.cost_per_merged_pr.toFixed(2)}`
          : "—",
      ],
    ]),
    "### Usage by SKU",
    "",
    formatSkuUsageTable(report.by_sku),
    formatContractDetails("CostReport@1.0", report as unknown as Record<string, unknown>),
  ].join("\n\n");
}
