import fs from "node:fs";
import path from "node:path";
import { estimateUsd } from "./token-budget.js";
import { resolveAgentSku, skuLabel } from "./commercial.js";

export interface CommercialUsageEvent {
  contract: "CommercialUsageEvent";
  version: "1.0";
  timestamp: string;
  agent_id: string;
  sku: string;
  source: "pipeline" | "channel" | "cli" | "cloud-agent";
  issue_id?: number;
  session_id?: string;
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

export interface SkuUsageAggregate {
  sku: string;
  label: string;
  agents: string[];
  invocations: number;
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

function usageLogPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "commercial", "usage.jsonl");
}

export function recordCommercialUsage(opts: {
  projectDir: string;
  agentId: string;
  source: CommercialUsageEvent["source"];
  tokens: { input: number; output: number };
  issueId?: number;
  sessionId?: string;
  platformRoot?: string;
}): void {
  const event: CommercialUsageEvent = {
    contract: "CommercialUsageEvent",
    version: "1.0",
    timestamp: new Date().toISOString(),
    agent_id: opts.agentId,
    sku: resolveAgentSku(opts.agentId, opts.platformRoot),
    source: opts.source,
    issue_id: opts.issueId,
    session_id: opts.sessionId,
    tokens_in: opts.tokens.input,
    tokens_out: opts.tokens.output,
    usd: estimateUsd({ input: opts.tokens.input, output: opts.tokens.output }),
  };

  const p = usageLogPath(opts.projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, `${JSON.stringify(event)}\n`);
}

export function loadCommercialUsageEvents(
  projectDir: string,
  month?: string
): CommercialUsageEvent[] {
  const p = usageLogPath(projectDir);
  if (!fs.existsSync(p)) return [];

  const prefix = month?.slice(0, 7);
  const events: CommercialUsageEvent[] = [];
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as CommercialUsageEvent;
      if (prefix && !ev.timestamp.startsWith(prefix)) continue;
      events.push(ev);
    } catch {
      /* skip */
    }
  }
  return events;
}

export function aggregateUsageBySku(opts: {
  projectDir: string;
  month?: string;
  lineItems?: Array<{
    agent?: string;
    tokens_in: number;
    tokens_out: number;
    usd: number;
  }>;
  platformRoot?: string;
}): Record<string, SkuUsageAggregate> {
  const bySku: Record<string, SkuUsageAggregate> = {};

  const bump = (
    agentId: string | undefined,
    tokensIn: number,
    tokensOut: number,
    usd: number
  ) => {
    if (!agentId) return;
    const sku = resolveAgentSku(agentId, opts.platformRoot);
    const entry = bySku[sku] ?? {
      sku,
      label: skuLabel(sku, opts.platformRoot),
      agents: [],
      invocations: 0,
      tokens_in: 0,
      tokens_out: 0,
      usd: 0,
    };
    if (!entry.agents.includes(agentId)) entry.agents.push(agentId);
    entry.invocations += 1;
    entry.tokens_in += tokensIn;
    entry.tokens_out += tokensOut;
    entry.usd += usd;
    bySku[sku] = entry;
  };

  for (const ev of loadCommercialUsageEvents(opts.projectDir, opts.month)) {
    bump(ev.agent_id, ev.tokens_in, ev.tokens_out, ev.usd);
  }

  for (const li of opts.lineItems ?? []) {
    bump(li.agent, li.tokens_in, li.tokens_out, li.usd);
  }

  return bySku;
}

export function formatSkuUsageTable(bySku: Record<string, SkuUsageAggregate>): string {
  const rows = Object.values(bySku).sort((a, b) => b.usd - a.usd);
  if (!rows.length) return "_No SKU usage recorded this period._";

  return [
    "| SKU | Label | Invocations | Tokens (in/out) | USD |",
    "| --- | --- | ---: | --- | ---: |",
    ...rows.map(
      (r) =>
        `| \`${r.sku}\` | ${r.label} | ${r.invocations} | ${r.tokens_in} / ${r.tokens_out} | $${r.usd.toFixed(2)} |`
    ),
  ].join("\n");
}
