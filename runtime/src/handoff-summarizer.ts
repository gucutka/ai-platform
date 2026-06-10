import type { ClaudeRuntimeClient } from "./claude-runtime.js";
import { humanAgentName } from "./comment-format.js";
import type { HandoffSummaryRecord } from "./handoff.js";
import { buildHandoff } from "./handoff.js";

const MAX_SUMMARY_CHARS = 2000;

function pickContractHighlights(contract: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const name = String(contract.contract ?? "unknown");

  if (contract.risk_level) lines.push(`risk: ${contract.risk_level}`);
  if (contract.path_key) lines.push(`path: ${contract.path_key}`);
  if (contract.verdict) lines.push(`verdict: ${contract.verdict}`);
  if (contract.ready_for_merge != null) {
    lines.push(`ready_for_merge: ${contract.ready_for_merge}`);
  }
  if (contract.branch_name ?? contract.branch) {
    lines.push(`branch: ${contract.branch_name ?? contract.branch}`);
  }
  if (Array.isArray(contract.tasks)) {
    lines.push(`tasks: ${contract.tasks.length}`);
  }
  if (Array.isArray(contract.files)) {
    lines.push(`files: ${contract.files.length}`);
  }
  if (Array.isArray(contract.findings)) {
    lines.push(`findings: ${contract.findings.length}`);
  }
  if (contract.title) lines.push(`title: ${String(contract.title).slice(0, 120)}`);
  if (contract.summary) lines.push(String(contract.summary).slice(0, 300));

  if (!lines.length) {
    lines.push(`${name} emitted (${Object.keys(contract).length} fields)`);
  }
  return lines;
}

function deterministicSummary(
  fromContract: Record<string, unknown>,
  fromAgent: string,
  toAgent: string,
  stage: string
): string {
  const highlights = pickContractHighlights(fromContract);
  const body = highlights.join("\n- ");
  const text = `**${humanAgentName(fromAgent)}** completed \`${stage}\` and handed off to **${humanAgentName(toAgent)}**.\n\n${body ? `- ${body}` : ""}`;
  return text.slice(0, MAX_SUMMARY_CHARS);
}

export async function summarizeHandoff(opts: {
  issueId: number;
  fromAgent: string;
  toAgent: string;
  stage: string;
  contractsPassed: string[];
  fromContract: Record<string, unknown>;
  claude?: ClaudeRuntimeClient;
  useLlm?: boolean;
}): Promise<HandoffSummaryRecord> {
  const fallback = buildHandoff({
    issueId: opts.issueId,
    fromAgent: opts.fromAgent,
    toAgent: opts.toAgent,
    stage: opts.stage,
    summary: deterministicSummary(
      opts.fromContract,
      opts.fromAgent,
      opts.toAgent,
      opts.stage
    ),
    contractsPassed: opts.contractsPassed,
  });

  if (!opts.useLlm || !opts.claude) {
    return fallback;
  }

  try {
    const result = await opts.claude.invoke({
      model: "claude-haiku-4-5",
      maxTokens: 1024,
      system: `You are handoff-summarizer-agent. Emit HandoffSummary@1.0 JSON in a \`\`\`ai-platform-contract fence. Summary ≤500 tokens. Preserve decision-critical fields.`,
      userMessage: `Compress handoff from ${opts.fromAgent} to ${opts.toAgent} (stage: ${opts.stage}).
issue_id: ${opts.issueId}
contracts_passed: ${JSON.stringify(opts.contractsPassed)}
from_contract:
${JSON.stringify(opts.fromContract, null, 2).slice(0, 12000)}`,
      maxRetries: 1,
      contractName: "HandoffSummary",
    });

    if (result.contract?.contract === "HandoffSummary") {
      return {
        contract: "HandoffSummary",
        version: "1.0",
        issue_id: opts.issueId,
        from_agent: opts.fromAgent,
        to_agent: opts.toAgent,
        stage: opts.stage,
        summary: String(result.contract.summary ?? fallback.summary),
        contracts_passed: opts.contractsPassed,
        timestamp: new Date().toISOString(),
      };
    }
  } catch {
    /* deterministic fallback */
  }

  return fallback;
}

/** Long paths: spec chain + implement + quality layers */
export function isLongPath(stageCount: number): boolean {
  return stageCount >= 4;
}
