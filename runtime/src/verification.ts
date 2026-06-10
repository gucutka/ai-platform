import type { CiRunResult } from "./ci-runner.js";
import type { CodeGuardResult } from "./code-guard.js";
import {
  formatContractDetails,
  formatKeyValueTable,
  formatStatusHeader,
  machineMarker,
} from "./comment-format.js";

export interface VerificationResultRecord {
  contract: "VerificationResult";
  version: "1.0";
  issue_id: number;
  pr_number: number;
  ci_status: "passed" | "failed" | "skipped";
  acceptance_criteria_verified: boolean[];
  acceptance_criteria: string[];
  ready_for_merge: boolean;
  code_guard_errors: string[];
  code_guard_warnings: string[];
  ci_commands: { command: string; exitCode: number; duration_ms: number }[];
  ci_error?: string;
  tests_passed: boolean;
  regression_risk: "low" | "medium" | "high";
  verified_by: "deterministic-qa-gate";
  timestamp: string;
}

export function parseAcceptanceCriteria(issueBody: string): string[] {
  const lines = issueBody.split(/\r?\n/);
  const items: string[] = [];
  let inAc = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#+\s*acceptance criteria/i.test(trimmed) || /^acceptance criteria/i.test(trimmed)) {
      inAc = true;
      continue;
    }
    if (inAc && /^#+\s/.test(trimmed) && !/^#+\s*acceptance/i.test(trimmed)) {
      break;
    }
    if (!inAc) continue;
    const bullet = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (bullet.length > 3) items.push(bullet);
  }

  if (items.length === 0) {
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.+)/);
      if (m && m[1].length > 5) items.push(m[1].trim());
    }
  }

  return items.slice(0, 20);
}

export function buildVerificationResult(opts: {
  issueId: number;
  prNumber?: number;
  issueBody: string;
  guard: CodeGuardResult;
  ci: CiRunResult;
}): VerificationResultRecord {
  const acceptance_criteria = parseAcceptanceCriteria(opts.issueBody);
  const guardOk = opts.guard.valid;
  const ciOk = opts.ci.ci_status === "passed";
  const tests_passed = ciOk;

  const acceptance_criteria_verified =
    acceptance_criteria.length > 0
      ? acceptance_criteria.map(() => guardOk && ciOk)
      : [guardOk && ciOk];

  const ready_for_merge = guardOk && ciOk;

  return {
    contract: "VerificationResult",
    version: "1.0",
    issue_id: opts.issueId,
    pr_number: opts.prNumber ?? 0,
    ci_status: opts.ci.ci_status,
    acceptance_criteria,
    acceptance_criteria_verified,
    ready_for_merge,
    code_guard_errors: opts.guard.errors,
    code_guard_warnings: opts.guard.warnings,
    ci_commands: opts.ci.commands.map((c) => ({
      command: c.command,
      exitCode: c.exitCode,
      duration_ms: c.duration_ms,
    })),
    ci_error: opts.ci.error,
    tests_passed,
    regression_risk: ready_for_merge ? "low" : "high",
    verified_by: "deterministic-qa-gate",
    timestamp: new Date().toISOString(),
  };
}

export function formatVerificationComment(data: VerificationResultRecord): string {
  const verdict = data.ready_for_merge ? "PASS" : "FAIL";
  const acLines = data.acceptance_criteria
    .map((ac, i) => {
      const ok = data.acceptance_criteria_verified[i];
      return `- ${ok ? "✅" : "❌"} ${ac}`;
    })
    .join("\n");

  const sections = [
    machineMarker("agent", "qa-agent"),
    formatStatusHeader("QA verification", verdict),
    formatKeyValueTable([
      ["CI status", String(data.ci_status)],
      ["Tests passed", String(data.tests_passed ?? "—")],
      ["Ready to merge", String(data.ready_for_merge)],
      ["Regression risk", String(data.regression_risk ?? "—")],
    ]),
    acLines ? `### Acceptance criteria\n\n${acLines}` : "",
    data.code_guard_errors.length
      ? `### Code guard\n\n${data.code_guard_errors.map((e) => `- ${e}`).join("\n")}`
      : "",
    data.ci_error ? `### CI error\n\n\`\`\`\n${data.ci_error}\n\`\`\`` : "",
    formatContractDetails("VerificationResult@1.0", data as unknown as Record<string, unknown>),
  ];

  return sections.filter((s) => s.trim()).join("\n\n");
}
