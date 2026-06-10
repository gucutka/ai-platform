import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  formatContractDetails,
  formatVerdictBadge,
  humanAgentName,
  machineMarker,
} from "./comment-format.js";
import { getProjectDir } from "./config.js";

export interface AuditEvent {
  ts: string;
  event: string;
  run_id: string;
  issue_id: number;
  project_id: string;
  actor_type: "system" | "agent";
  agent?: string;
  contract?: string;
  contract_hash?: string;
  status?: "ok" | "error";
  duration_ms?: number;
  tokens?: { input: number; output: number };
  pr_number?: number;
  review_verdict?: string;
  error?: string;
  github_run_id?: string;
  github_workflow?: string;
  github_repository?: string;
  github_sha?: string;
  github_run_attempt?: string;
  details?: Record<string, unknown>;
}

export interface PipelineAgentStep {
  agent_id: string;
  status: "ok" | "error" | "skipped";
  output_contract?: string;
  duration_ms?: number;
  tokens?: { input: number; output: number };
  verdict?: string;
  error?: string;
}

export interface PipelineRunRecord {
  contract: "PipelineRun";
  version: "1.0";
  run_id: string;
  issue_id: number;
  project_id: string;
  status: "success" | "failed" | "waiting";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  agents: PipelineAgentStep[];
  pr_number?: number;
  review_verdict?: string;
  tokens_total: { input: number; output: number };
  context_stats?: {
    packs_built: number;
    total_estimated_prompt_tokens: number;
  };
  github: {
    run_id?: string;
    workflow?: string;
    repository?: string;
    sha?: string;
    attempt?: string;
  };
  error?: string;
  artifact_hint: string;
}

export function getAuditDir(projectDir: string, issueId: number): string {
  return path.join(projectDir ?? getProjectDir(), ".ai-platform", "audit", String(issueId));
}

function hashContract(data: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 16);
}

function githubMeta(): Pick<
  AuditEvent,
  | "github_run_id"
  | "github_workflow"
  | "github_repository"
  | "github_sha"
  | "github_run_attempt"
> {
  return {
    github_run_id: process.env.GITHUB_RUN_ID,
    github_workflow: process.env.GITHUB_WORKFLOW,
    github_repository: process.env.GITHUB_REPOSITORY,
    github_sha: process.env.GITHUB_SHA,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT,
  };
}

export class AuditSession {
  readonly runId: string;
  readonly issueId: number;
  readonly projectId: string;
  readonly projectDir: string;
  readonly startedAt: string;
  private readonly startMs: number;
  private readonly events: AuditEvent[] = [];
  private readonly agents: PipelineAgentStep[] = [];
  private pipelineRun: PipelineRunRecord | null = null;

  constructor(opts: { projectDir: string; issueId: number; projectId: string }) {
    this.projectDir = opts.projectDir;
    this.issueId = opts.issueId;
    this.projectId = opts.projectId;
    this.startedAt = new Date().toISOString();
    this.startMs = Date.now();
    const ghRun = process.env.GITHUB_RUN_ID ?? Date.now();
    this.runId = `run-${opts.issueId}-${ghRun}`;
  }

  private append(partial: Omit<AuditEvent, "run_id" | "issue_id" | "project_id" | "ts">) {
    const event: AuditEvent = {
      ts: new Date().toISOString(),
      run_id: this.runId,
      issue_id: this.issueId,
      project_id: this.projectId,
      ...githubMeta(),
      ...partial,
    };
    this.events.push(event);
  }

  recordPipelineStarted() {
    this.append({
      event: "pipeline.started",
      actor_type: "system",
      status: "ok",
    });
  }

  recordPipelineResumed(fromRunId: string, resumeFrom: string) {
    this.append({
      event: "pipeline.resumed",
      actor_type: "system",
      status: "ok",
      details: { from_run_id: fromRunId, resume_from: resumeFrom },
    });
  }

  recordDlqEnqueued(entry: {
    failed_step: string;
    error: string;
    attempts: number;
  }) {
    this.append({
      event: "dlq.enqueued",
      actor_type: "system",
      status: "error",
      error: entry.error,
      details: {
        failed_step: entry.failed_step,
        attempts: entry.attempts,
      },
    });
  }

  recordCostAlert(alert: {
    used_percent: number;
    label: string;
    action: string;
  }) {
    this.append({
      event: "cost.alert",
      actor_type: "system",
      status: "ok",
      details: alert,
    });
  }

  recordAgentStarted(agentId: string) {
    this.append({
      event: "agent.started",
      actor_type: "agent",
      agent: agentId,
      status: "ok",
    });
  }

  recordContextPackBuilt(agentId: string, pack: {
    context_pack_hash?: string;
    tier?: string;
    token_budget?: { estimated_prompt_tokens?: number; tier_limit_tokens?: number };
    files?: { path: string }[];
    refs?: unknown[];
  }) {
    this.append({
      event: "context_pack.built",
      actor_type: "system",
      agent: agentId,
      contract: "ContextPack",
      contract_hash: pack.context_pack_hash,
      status: "ok",
      details: {
        tier: pack.tier,
        context_pack_hash: pack.context_pack_hash,
        file_count: pack.files?.length ?? 0,
        ref_count: pack.refs?.length ?? 0,
        estimated_prompt_tokens: pack.token_budget?.estimated_prompt_tokens,
        tier_limit_tokens: pack.token_budget?.tier_limit_tokens,
      },
    });
  }

  recordMergeCompleted(record: {
    issue_id: number;
    pr_number: number;
    merge_sha?: string;
    merged_by?: string;
  }) {
    this.append({
      event: "merge.completed",
      actor_type: "system",
      contract: "MergeRecord",
      status: "ok",
      pr_number: record.pr_number,
      details: {
        merge_sha: record.merge_sha,
        merged_by: record.merged_by,
      },
    });
  }

  recordPostMergeAgent(agentId: string, contract: Record<string, unknown>) {
    this.append({
      event: "post_merge.agent_completed",
      actor_type: "agent",
      agent: agentId,
      contract: String(contract.contract ?? "unknown"),
      status: "ok",
      details: {
        status: contract.status,
        docs_updated: contract.docs_updated,
        tag: contract.tag,
        version: contract.version,
      },
    });
  }

  recordPostMergeCompleted(prNumber: number, tag: string) {
    this.append({
      event: "post_merge.completed",
      actor_type: "system",
      status: "ok",
      pr_number: prNumber,
      details: { release_tag_draft: tag },
    });
  }

  recordAgentCompleted(opts: {
    agentId: string;
    contract: Record<string, unknown>;
    usage: { input: number; output: number };
    durationMs: number;
    selfReviewPassed?: boolean;
  }) {
    const contractName = String(opts.contract.contract ?? "unknown");
    const step: PipelineAgentStep = {
      agent_id: opts.agentId,
      status: "ok",
      output_contract: contractName,
      duration_ms: opts.durationMs,
      tokens: opts.usage,
    };
    if (contractName === "ReviewReport") {
      step.verdict = String(opts.contract.verdict ?? "");
    }
    this.agents.push(step);
    this.append({
      event: "agent.completed",
      actor_type: "agent",
      agent: opts.agentId,
      contract: contractName,
      contract_hash: hashContract(opts.contract),
      status: "ok",
      duration_ms: opts.durationMs,
      tokens: opts.usage,
      details:
        opts.selfReviewPassed !== undefined
          ? { self_review_passed: opts.selfReviewPassed }
          : undefined,
    });
  }

  recordAgentFailed(
    agentId: string,
    opts: { durationMs: number; errors: string[]; usage?: { input: number; output: number } }
  ) {
    const error = opts.errors.join("; ") || "unknown error";
    this.agents.push({
      agent_id: agentId,
      status: "error",
      duration_ms: opts.durationMs,
      tokens: opts.usage,
      error,
    });
    this.append({
      event: "agent.failed",
      actor_type: "agent",
      agent: agentId,
      status: "error",
      duration_ms: opts.durationMs,
      tokens: opts.usage,
      error,
      details: { errors: opts.errors },
    });
  }

  recordContractValidation(opts: {
    agentId: string;
    targetContract: string;
    valid: boolean;
    errors: string[];
    semanticErrors: string[];
  }) {
    this.append({
      event: opts.valid ? "contract.validated" : "contract.validation_failed",
      actor_type: "agent",
      agent: "contract-validator-agent",
      contract: opts.targetContract,
      status: opts.valid ? "ok" : "error",
      details: {
        source_agent: opts.agentId,
        errors: opts.errors,
        semantic_errors: opts.semanticErrors,
      },
    });
  }

  recordTokenBudgetBlocked(opts: {
    estimatedUsd: number;
    limitUsd: number;
    tokens: { input: number; output: number };
  }) {
    this.append({
      event: "token_budget.blocked",
      actor_type: "system",
      status: "error",
      error: `budget exceeded: $${opts.estimatedUsd.toFixed(2)} > $${opts.limitUsd}`,
      tokens: opts.tokens,
      details: {
        estimated_usd: opts.estimatedUsd,
        limit_usd: opts.limitUsd,
      },
    });
  }

  getRunningTokenUsage(): { input: number; output: number } {
    return this.sumTokens();
  }

  recordPrCreated(prNumber: number) {
    this.append({
      event: "pr.created",
      actor_type: "system",
      status: "ok",
      pr_number: prNumber,
    });
  }

  finalizeSuccess(opts: {
    prNumber: number;
    reviewVerdict: string;
  }) {
    const completedAt = new Date().toISOString();
    const tokens = this.sumTokens();
    const contextStats = this.sumContextPackStats();
    this.pipelineRun = {
      contract: "PipelineRun",
      version: "1.0",
      run_id: this.runId,
      issue_id: this.issueId,
      project_id: this.projectId,
      status: "success",
      started_at: this.startedAt,
      completed_at: completedAt,
      duration_ms: Date.now() - this.startMs,
      agents: this.agents,
      pr_number: opts.prNumber,
      review_verdict: opts.reviewVerdict,
      tokens_total: tokens,
      context_stats: contextStats.packs_built ? contextStats : undefined,
      github: {
        run_id: process.env.GITHUB_RUN_ID,
        workflow: process.env.GITHUB_WORKFLOW,
        repository: process.env.GITHUB_REPOSITORY,
        sha: process.env.GITHUB_SHA,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
      },
      artifact_hint: `.ai-platform/audit/${this.issueId}/${this.runId}.pipeline-run.json`,
    };
    this.append({
      event: "pipeline.completed",
      actor_type: "system",
      status: "ok",
      pr_number: opts.prNumber,
      review_verdict: opts.reviewVerdict,
      duration_ms: this.pipelineRun.duration_ms,
      tokens: tokens,
    });
  }

  finalizeWaiting(opts: { reason: string; step?: string }) {
    const completedAt = new Date().toISOString();
    const tokens = this.sumTokens();
    const contextStats = this.sumContextPackStats();
    this.pipelineRun = {
      contract: "PipelineRun",
      version: "1.0",
      run_id: this.runId,
      issue_id: this.issueId,
      project_id: this.projectId,
      status: "waiting",
      started_at: this.startedAt,
      completed_at: completedAt,
      duration_ms: Date.now() - this.startMs,
      agents: this.agents,
      tokens_total: tokens,
      context_stats: contextStats.packs_built ? contextStats : undefined,
      github: {
        run_id: process.env.GITHUB_RUN_ID,
        workflow: process.env.GITHUB_WORKFLOW,
        repository: process.env.GITHUB_REPOSITORY,
        sha: process.env.GITHUB_SHA,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
      },
      error: opts.reason,
      artifact_hint: `.ai-platform/audit/${this.issueId}/${this.runId}.pipeline-run.json`,
    };
    this.append({
      event: "pipeline.waiting",
      actor_type: "system",
      status: "ok",
      duration_ms: this.pipelineRun.duration_ms,
      tokens: tokens,
      details: { reason: opts.reason, step: opts.step },
    });
  }

  finalizeFailure(err: unknown) {
    const completedAt = new Date().toISOString();
    const tokens = this.sumTokens();
    const contextStats = this.sumContextPackStats();
    const message = err instanceof Error ? err.message : String(err);
    this.pipelineRun = {
      contract: "PipelineRun",
      version: "1.0",
      run_id: this.runId,
      issue_id: this.issueId,
      project_id: this.projectId,
      status: "failed",
      started_at: this.startedAt,
      completed_at: completedAt,
      duration_ms: Date.now() - this.startMs,
      agents: this.agents,
      tokens_total: tokens,
      context_stats: contextStats.packs_built ? contextStats : undefined,
      github: {
        run_id: process.env.GITHUB_RUN_ID,
        workflow: process.env.GITHUB_WORKFLOW,
        repository: process.env.GITHUB_REPOSITORY,
        sha: process.env.GITHUB_SHA,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
      },
      error: message,
      artifact_hint: `.ai-platform/audit/${this.issueId}/${this.runId}.pipeline-run.json`,
    };
    this.append({
      event: "pipeline.failed",
      actor_type: "system",
      status: "error",
      error: message,
      duration_ms: this.pipelineRun.duration_ms,
      tokens: tokens,
    });
  }

  private sumTokens(): { input: number; output: number } {
    return this.agents.reduce(
      (acc, a) => ({
        input: acc.input + (a.tokens?.input ?? 0),
        output: acc.output + (a.tokens?.output ?? 0),
      }),
      { input: 0, output: 0 }
    );
  }

  private sumContextPackStats(): {
    packs_built: number;
    total_estimated_prompt_tokens: number;
  } {
    const packEvents = this.events.filter((e) => e.event === "context_pack.built");
    return {
      packs_built: packEvents.length,
      total_estimated_prompt_tokens: packEvents.reduce(
        (sum, e) => sum + (Number(e.details?.estimated_prompt_tokens) || 0),
        0
      ),
    };
  }

  save(): { auditDir: string; runId: string } {
    const dir = getAuditDir(this.projectDir, this.issueId);
    fs.mkdirSync(dir, { recursive: true });

    const eventsPath = path.join(dir, `${this.runId}.events.jsonl`);
    fs.writeFileSync(
      eventsPath,
      this.events.map((e) => JSON.stringify(e)).join("\n") + (this.events.length ? "\n" : "")
    );

    if (this.pipelineRun) {
      fs.writeFileSync(
        path.join(dir, `${this.runId}.pipeline-run.json`),
        JSON.stringify(this.pipelineRun, null, 2)
      );
      fs.writeFileSync(path.join(dir, "latest.pipeline-run.json"), JSON.stringify(this.pipelineRun, null, 2));
    }

    fs.writeFileSync(
      path.join(dir, "latest.json"),
      JSON.stringify(
        {
          run_id: this.runId,
          issue_id: this.issueId,
          status: this.pipelineRun?.status ?? "unknown",
          updated_at: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return { auditDir: dir, runId: this.runId };
  }

  formatSummaryComment(): string {
    const run = this.pipelineRun;
    if (!run) {
      return [
        machineMarker("pipeline-run", this.runId),
        `## Pipeline run — incomplete`,
        `Run \`${this.runId}\` ended before summary was recorded.`,
        "",
        `Full trace: Actions artifact \`ai-platform-trace-issue-${this.issueId}\`.`,
      ].join("\n");
    }

    const rows = run.agents
      .map((a) => {
        const tok = a.tokens ? `${a.tokens.input} + ${a.tokens.output}` : "—";
        const dur = a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(1)}s` : "—";
        const status = a.verdict
          ? formatVerdictBadge(String(a.verdict))
          : a.error
            ? `❌ ${a.error.slice(0, 60)}`
            : a.status;
        return `| ${humanAgentName(a.agent_id)} | ${status} | ${tok} | ${dur} |`;
      })
      .join("\n");

    const ghRun = run.github.run_id
      ? `[workflow run](https://github.com/${run.github.repository}/actions/runs/${run.github.run_id})`
      : "local run";

    const meta = [
      `**Status:** ${formatVerdictBadge(run.status)}`,
      `**Issue:** #${run.issue_id}`,
      `**Duration:** ${(run.duration_ms / 1000).toFixed(1)}s`,
      `**Tokens:** ${run.tokens_total.input} in / ${run.tokens_total.output} out`,
      run.pr_number ? `**PR:** #${run.pr_number}` : "",
      run.review_verdict ? `**Review:** ${formatVerdictBadge(run.review_verdict)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    return [
      machineMarker("pipeline-run", run.run_id),
      `## Pipeline run complete`,
      meta,
      "",
      "| Step | Result | Tokens (in + out) | Duration |",
      "|------|--------|-------------------|----------|",
      rows || "| — | — | — | — |",
      "",
      `**Trace:** ${ghRun} → Artifacts → \`ai-platform-trace-issue-${run.issue_id}\``,
      formatContractDetails("PipelineRun@1.0", run as unknown as Record<string, unknown>),
    ].join("\n");
  }

  getPipelineRun(): PipelineRunRecord | null {
    return this.pipelineRun;
  }
}
