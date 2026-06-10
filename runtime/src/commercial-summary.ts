import {
  evaluateLicenseStatus,
  listSellablePackages,
  loadCommercialConfig,
  type LicenseEvaluation,
} from "./commercial.js";
import { formatSkuUsageTable, loadCommercialUsageEvents } from "./commercial-usage.js";
import { buildCostReport, type CostReport } from "./cost-report.js";
import type { Manifest } from "./types.js";

export interface CommercialSummary {
  contract: "CommercialSummary";
  version: "1.0";
  period: string;
  license: LicenseEvaluation;
  packages_catalog: ReturnType<typeof listSellablePackages>;
  cost_report: Pick<
    CostReport,
    "totals" | "by_sku" | "metrics" | "budget" | "commercial"
  >;
  channel_usage_events: number;
}

export function buildCommercialSummary(opts: {
  projectDir: string;
  manifest: Manifest;
  month?: string;
}): CommercialSummary {
  const month = opts.month ?? new Date().toISOString().slice(0, 7);
  const costReport = buildCostReport({
    projectDir: opts.projectDir,
    manifest: opts.manifest,
    month,
  });
  const channelEvents = loadCommercialUsageEvents(opts.projectDir, month);

  return {
    contract: "CommercialSummary",
    version: "1.0",
    period: month,
    license: evaluateLicenseStatus(opts.manifest),
    packages_catalog: listSellablePackages(),
    cost_report: {
      totals: costReport.totals,
      by_sku: costReport.by_sku,
      metrics: costReport.metrics,
      budget: costReport.budget,
      commercial: costReport.commercial,
    },
    channel_usage_events: channelEvents.length,
  };
}

export function formatCommercialSummaryMarkdown(summary: CommercialSummary): string {
  const lic = summary.license;
  const licenseBlock =
    lic.mode === "all_agents" ?
      "_All catalog agents licensed (no `purchased_agents` restriction)._"
    : [
        "**Licensed packages:**",
        ...lic.packages.map((p) => `- \`${p.id}\` — ${p.label} (${p.agents.length} agents)`),
        lic.standalone_agents.length ?
          `\n**Standalone agents:** ${lic.standalone_agents.map((a) => `\`${a}\``).join(", ")}`
        : "",
      ].join("\n");

  const catalogBlock = summary.packages_catalog
    .map(
      (p) =>
        `- **${p.label}** (\`${p.id}\`) — ${
          p.list_price_usd_per_month != null ? `$${p.list_price_usd_per_month}/mo` : "contact sales"
        }`
    )
    .join("\n");

  return [
    `## Commercial summary — ${summary.period}`,
    "",
    "### Entitlements",
    "",
    licenseBlock,
    "",
    "### Usage by SKU (estimated tokens)",
    "",
    formatSkuUsageTable(summary.cost_report.by_sku),
    "",
    "### Totals",
    "",
    `- Issues: ${summary.cost_report.totals.issues}`,
    `- Estimated USD: $${summary.cost_report.totals.usd.toFixed(2)}`,
    `- Channel/cloud invocations logged: ${summary.channel_usage_events}`,
    "",
    "### Package catalog (reference pricing)",
    "",
    catalogBlock,
  ].join("\n");
}
