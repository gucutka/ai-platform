import fs from "node:fs";
import path from "node:path";
import { formatHandoffMarkdown } from "./comment-format.js";
import { getProjectDir } from "./config.js";

export interface HandoffSummaryRecord {
  contract: "HandoffSummary";
  version: "1.0";
  issue_id: number;
  from_agent: string;
  to_agent: string;
  stage: string;
  summary: string;
  contracts_passed: string[];
  timestamp: string;
}

export function saveHandoffSummary(
  projectDir: string,
  issueId: number,
  data: HandoffSummaryRecord
): void {
  const dir = path.join(projectDir ?? getProjectDir(), ".ai-platform", "handoffs", String(issueId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${data.from_agent}-to-${data.to_agent}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function formatHandoffComment(data: HandoffSummaryRecord): string {
  return formatHandoffMarkdown(data);
}

export function buildHandoff(opts: {
  issueId: number;
  fromAgent: string;
  toAgent: string;
  stage: string;
  summary: string;
  contractsPassed: string[];
}): HandoffSummaryRecord {
  return {
    contract: "HandoffSummary",
    version: "1.0",
    issue_id: opts.issueId,
    from_agent: opts.fromAgent,
    to_agent: opts.toAgent,
    stage: opts.stage,
    summary: opts.summary,
    contracts_passed: opts.contractsPassed,
    timestamp: new Date().toISOString(),
  };
}
