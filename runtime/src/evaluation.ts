import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "./config.js";

export interface AgentExecutionReport {
  contract: "AgentExecutionReport";
  version: "1.0";
  agent: string;
  task: string;
  issue_id: number;
  duration_ms: number;
  tokens_used: { input: number; output: number };
  files_changed: number;
  tests_generated: number;
  review_comments: number;
  review_failures: number;
  qa_failures: number;
  security_findings: number;
  accepted_pr: boolean;
  human_rework_required: boolean;
  agent_score: number;
  score_breakdown: Record<string, number>;
  what_worked: string[];
  what_failed: string[];
  root_cause: string | null;
  recommended_improvements: string[];
  timestamp: string;
}

export function buildExecutionReport(opts: {
  agentId: string;
  issueId: number;
  task: string;
  durationMs: number;
  tokens: { input: number; output: number };
  outputContract: Record<string, unknown>;
  selfReviewPassed?: boolean;
}): AgentExecutionReport {
  const c = opts.outputContract;
  const findings = (c.findings as unknown[]) ?? [];
  const verdict = String(c.verdict ?? "").toUpperCase();
  const files = (c.files as unknown[]) ?? [];
  const tests = (c.tests_added as number) ?? (c.tests as unknown[])?.length ?? 0;

  const reviewFailures =
    opts.agentId === "review-agent" && verdict === "FAIL" ? findings.length : 0;
  const qaFailures =
    opts.agentId === "qa-agent" && c.ready_for_merge === false ? 1 : 0;
  const securityFindings = findings.filter((f) => {
    const o = f as { severity?: string; category?: string };
    return o.severity === "critical" || o.category === "security";
  }).length;

  const breakdown = scoreAgent({
    agentId: opts.agentId,
    contract: c,
    selfReviewPassed: opts.selfReviewPassed ?? true,
    reviewFailures,
    qaFailures,
    securityFindings,
  });

  const humanRework =
    verdict === "FAIL" ||
    c.escalation_recommended === true ||
    opts.selfReviewPassed === false;

  return {
    contract: "AgentExecutionReport",
    version: "1.0",
    agent: opts.agentId,
    task: opts.task,
    issue_id: opts.issueId,
    duration_ms: opts.durationMs,
    tokens_used: opts.tokens,
    files_changed: files.length || Number(c.files_changed ?? 0),
    tests_generated: tests,
    review_comments: findings.length,
    review_failures: reviewFailures,
    qa_failures: qaFailures,
    security_findings: securityFindings,
    accepted_pr: verdict === "PASS" || c.ready_for_merge === true,
    human_rework_required: humanRework,
    agent_score: breakdown.total,
    score_breakdown: breakdown.components,
    what_worked: breakdown.whatWorked,
    what_failed: breakdown.whatFailed,
    root_cause: breakdown.rootCause,
    recommended_improvements: breakdown.recommendations,
    timestamp: new Date().toISOString(),
  };
}

function scoreAgent(opts: {
  agentId: string;
  contract: Record<string, unknown>;
  selfReviewPassed: boolean;
  reviewFailures: number;
  qaFailures: number;
  securityFindings: number;
}): {
  total: number;
  components: Record<string, number>;
  whatWorked: string[];
  whatFailed: string[];
  rootCause: string | null;
  recommendations: string[];
} {
  const components: Record<string, number> = {};
  const whatWorked: string[] = [];
  const whatFailed: string[] = [];
  const recommendations: string[] = [];
  let rootCause: string | null = null;

  // Base scores by agent type (see evaluation/scoring-rules.yaml)
  if (opts.agentId.includes("implement")) {
    components.contract_valid = opts.contract.contract ? 15 : 0;
    components.self_review = opts.selfReviewPassed ? 25 : 0;
    components.minimal_diff = (opts.contract.files as unknown[])?.length <= 8 ? 20 : 10;
    components.no_escalation = opts.contract.escalation_recommended ? 0 : 20;
    components.plan_alignment =
      Number(opts.contract.plan_task_coverage ?? 0) >= 0.9 ? 20 : 10;
    if (!opts.selfReviewPassed) {
      whatFailed.push("Self-review detected violations");
      recommendations.push("Re-run with stricter adherence to backend/frontend standards");
      rootCause = "Standards violation in generated code";
    } else {
      whatWorked.push("Self-review passed");
    }
  } else if (opts.agentId === "review-agent") {
    components.verdict_valid = ["PASS", "FAIL"].includes(String(opts.contract.verdict)) ? 15 : 0;
    components.findings_specificity =
      (opts.contract.findings as unknown[])?.length > 0 || opts.contract.verdict === "PASS"
        ? 25
        : 5;
    components.spec_compliance = Number(opts.contract.spec_compliance ?? 0) * 30;
    components.architecture_checked = opts.contract.architecture_compliance != null ? 20 : 5;
    components.no_false_pass =
      opts.reviewFailures === 0 && opts.contract.verdict === "PASS" ? 10 : 0;
    if (opts.reviewFailures > 0) {
      whatFailed.push(`${opts.reviewFailures} review findings`);
      rootCause = "Implementation quality below gate";
    }
  } else if (opts.agentId === "qa-agent") {
    components.ac_coverage = opts.contract.ready_for_merge ? 30 : 10;
    components.tests_present = (opts.contract.tests_added as number) > 0 ? 25 : 0;
    components.edge_cases = (opts.contract.edge_cases_covered as boolean) ? 20 : 5;
    components.regression_risk = opts.contract.regression_risk === "low" ? 25 : 10;
    if (opts.qaFailures) {
      whatFailed.push("QA gate not satisfied");
      rootCause = "Incomplete AC or test coverage";
    }
  } else {
    components.contract_valid = opts.contract.contract ? 20 : 0;
    components.output_complete = Object.keys(opts.contract).length >= 4 ? 25 : 10;
    components.no_escalation = opts.contract.escalation_recommended ? 0 : 25;
    components.self_review = opts.selfReviewPassed ? 20 : 5;
    components.timeliness = 10;
    if (opts.contract.escalation_recommended) {
      whatFailed.push("Agent recommended escalation");
      recommendations.push("Review ambiguity before next stage");
    } else {
      whatWorked.push("Stage contract produced");
    }
  }

  const total = Math.min(
    100,
    Math.round(Object.values(components).reduce((a, b) => a + b, 0))
  );

  return { total, components, whatWorked, whatFailed, rootCause, recommendations };
}

export function saveExecutionReport(
  projectDir: string,
  issueId: number,
  report: AgentExecutionReport
): void {
  const dir = path.join(
    projectDir ?? getProjectDir(),
    ".ai-platform",
    "evaluation",
    String(issueId)
  );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${report.agent}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  const optDir = path.join(
    projectDir ?? getProjectDir(),
    ".ai-platform",
    "optimization",
    String(issueId)
  );
  fs.mkdirSync(optDir, { recursive: true });
  fs.writeFileSync(
    path.join(optDir, `${report.agent}-latest.json`),
    JSON.stringify(
      {
        what_worked: report.what_worked,
        what_failed: report.what_failed,
        root_cause: report.root_cause,
        recommended_improvements: report.recommended_improvements,
        agent_score: report.agent_score,
      },
      null,
      2
    )
  );
}
