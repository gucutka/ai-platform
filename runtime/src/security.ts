import { formatGateNotice, formatReviewComment } from "./comment-format.js";
import type { GitHubClient } from "./github.js";
import type { Manifest } from "./types.js";
import type { WorkflowDecisionRecord } from "./workflow-router.js";
import { sastHasCritical, type SastScanResult } from "./security-sast.js";
import { SECURITY_LABELS } from "./security-labels.js";
import { evaluatePostSecurityGates } from "./gate-evaluator.js";

export { SECURITY_LABELS };

export class SecurityScanFailedError extends Error {
  readonly issueId: number;
  readonly prNumber: number;
  readonly verdict: string;

  constructor(issueId: number, prNumber: number, verdict: string) {
    super(`Security scan ${verdict} for issue #${issueId} (PR #${prNumber})`);
    this.name = "SecurityScanFailedError";
    this.issueId = issueId;
    this.prNumber = prNumber;
    this.verdict = verdict;
  }
}

export function isSecurityStepRequired(opts: {
  manifest: Manifest;
  workflowDecision: WorkflowDecisionRecord;
}): boolean {
  const gate = opts.manifest.gates ?? {};
  if (gate.require_security_scan || opts.manifest.client_tier === "regulated") {
    return true;
  }

  const skip = new Set(
    opts.workflowDecision.skip_stages.map((s) => s.toLowerCase())
  );
  if (skip.has("security")) return false;

  return (
    opts.workflowDecision.risk_level === "high" &&
    opts.workflowDecision.sdlc_path.includes("security")
  );
}

export function securityVerdictPassed(verdict: string): boolean {
  return String(verdict).toUpperCase() === "PASS";
}

export function reportHasCriticalFindings(contract: Record<string, unknown>): boolean {
  const findings = (contract.findings as { severity?: string }[]) ?? [];
  return findings.some((f) => String(f.severity ?? "").toLowerCase() === "critical");
}

export function finalizeSecurityReport(
  report: Record<string, unknown>,
  sast: SastScanResult
): Record<string, unknown> {
  const findings = [
    ...(Array.isArray(report.findings) ? report.findings : []),
  ] as { id?: string; severity?: string; file?: string; line?: number }[];

  const seen = new Set(findings.map((f) => f.id ?? `${f.file}:${f.line}`));
  for (const f of sast.findings) {
    const key = f.id ?? `${f.file}:${f.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(f);
  }

  const critical =
    sastHasCritical(sast.findings) ||
    findings.some((f) => String(f.severity ?? "").toLowerCase() === "critical");

  return {
    ...report,
    contract: "SecurityReport",
    version: "1.0",
    findings,
    verdict: critical ? "FAIL" : String(report.verdict ?? "PASS").toUpperCase(),
    sast_included: true,
  };
}

export async function applySecurityVerdict(
  github: GitHubClient,
  issueNumber: number,
  prNumber: number,
  contract: Record<string, unknown>,
  manifest: Manifest,
  reviewVerdict: string
): Promise<void> {
  const verdict = String(contract.verdict ?? "FAIL").toUpperCase();
  const critical = reportHasCriticalFindings(contract);
  const failed = verdict === "FAIL" || critical;

  const body = formatReviewComment(
    "Security scan",
    contract,
    "security-agent + deterministic SAST"
  );

  const event = failed ? "REQUEST_CHANGES" : "COMMENT";
  try {
    await github.createPullRequestReview(prNumber, body, event);
  } catch {
    await github.createPullRequestReview(prNumber, body, "COMMENT");
  }

  if (failed) {
    await github.addLabels(issueNumber, ["agent-route:blocked"]);
    await github.addLabels(prNumber, [SECURITY_LABELS.failed]);
    await github.removeLabel(issueNumber, "agent-route:ready-to-merge").catch(() => undefined);
    await github.addIssueComment(
      issueNumber,
      formatGateNotice({
        marker: "<!-- ai-platform-security-failed -->",
        title: "Security scan blocked merge",
        body: `Verdict **${verdict}**. Critical findings must be fixed before merge.\n\nRe-run the pipeline from \`security-agent\` after remediation.`,
      })
    );
    return;
  }

  await github.addLabels(prNumber, [SECURITY_LABELS.passed]);
  await github.removeLabel(prNumber, SECURITY_LABELS.required).catch(() => undefined);
  await github.removeLabel(issueNumber, SECURITY_LABELS.required).catch(() => undefined);

  const post = evaluatePostSecurityGates({
    manifest,
    reviewVerdict,
    securityVerdict: verdict,
  });
  if (post.issueLabels.length) {
    await github.addLabels(issueNumber, post.issueLabels);
  }
  if (post.prLabels.length) {
    await github.addLabels(prNumber, post.prLabels);
  }
  if (post.comment) {
    await github.addIssueComment(issueNumber, post.comment);
  }
}
