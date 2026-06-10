import fs from "node:fs";
import path from "node:path";
import { ClaudeRuntimeClient } from "./claude-runtime.js";
import {
  formatContractComment,
  normalizeContract,
  validateContract,
} from "./contracts.js";
import {
  buildContextFromGitHub,
  contextPackToAgentPrompt,
  loadManifest,
} from "./context-builder.js";
import { saveContextPackArtifact } from "./context-pack-store.js";
import { getOutputContractName, loadRuntimeDef, resolveImplementAgent, isImplementAgent, IMPLEMENT_AGENT_IDS } from "./agents.js";
import { getAgentModule } from "./agents/index.js";
import {
  isQualityAgent,
  loadArchitecturalRules,
  loadProductionSystemPrompt,
  loadProductionSystemPromptWithOptimization,
  loadSelfReviewPrompt,
} from "./prompt-loader.js";
import {
  buildExecutionReport,
  saveExecutionReport,
} from "./evaluation.js";
import { loadSkillsForAgent } from "./skills.js";
import { GitHubClient, saveArtifact, applyReviewVerdict, loadArtifact } from "./github.js";
import { notifySdlcEventSafe } from "./notifications/index.js";
import {
  buildDeterministicWorkflowDecision,
  normalizeWorkflowDecision,
  sanitizeWorkflowSkipStages,
  type WorkflowDecisionRecord,
} from "./workflow-router.js";
import {
  agentStepHasOutput,
  fetchIssueCommentsBody,
  hydrateContractsFromComments,
  resolveContract,
} from "./contract-store.js";
import {
  buildExecutionPlan,
  describeExecutionPlan,
  type PipelineStep,
} from "./pipeline-runner.js";
import {
  loadCheckpoint,
  markStepComplete,
  isStepCompleted,
  resolveStartIndex,
  recordPipelineFailure,
} from "./checkpoint.js";
import {
  buildHandoff,
  formatHandoffComment,
  saveHandoffSummary,
} from "./handoff.js";
import { summarizeHandoff, isLongPath } from "./handoff-summarizer.js";
import {
  checkMonthlyBudgetBlock,
  evaluateMonthlyCostAlerts,
  formatCostAlertComment,
} from "./cost-alerts.js";
import { buildCostReport } from "./cost-report.js";
import {
  enqueueDlqEntry,
  formatDlqComment,
  loadDlqEntry,
  resolveDlqEntry,
} from "./failure-recovery.js";
import { AuditSession, getAuditDir } from "./audit.js";
import { isAgentLicensed } from "./cloud-agent-catalog.js";
import {
  evaluateProjectLifecycle,
  formatLifecycleBlockComment,
} from "./project-lifecycle.js";
import { validateCodeChanges, validateCodeChangesAgainstPlan, resolveAllowedPaths } from "./code-guard.js";
import { runCiWithChanges, type CiRunResult } from "./ci-runner.js";
import {
  buildVerificationResult,
  formatVerificationComment,
  type VerificationResultRecord,
} from "./verification.js";
import { getPlatformRoot, getProjectDir, getRunsDir } from "./config.js";
import type { CodeChanges } from "./types.js";
import { checkAgentInputContracts } from "./compatibility.js";
import {
  runContractValidation,
  formatValidationFailureComment,
} from "./contract-validator.js";
import {
  evaluatePostReviewGates,
  evaluateArchitectReviewGate,
  evaluateArchitectureReviewPrecondition,
} from "./gate-evaluator.js";
import {
  ARCHITECT_GATE_LABELS,
  ArchitectGatePendingError,
  ArchitectGateRejectedError,
  buildArchitectReviewDecision,
  evaluateArchitectGateStatus,
  formatArchitectGateApprovedComment,
  formatArchitectGateEscalationComment,
  resolveArchitectHandle,
  shouldSkipArchitectGate,
  type ArchitectReviewDecisionRecord,
} from "./architect-gate.js";
import {
  ARCH_REVIEW_LABELS,
  ArchitectureReviewFailedError,
  architectureReviewVerdictPassed,
  isArchitectureReviewRequired,
  shouldSkipArchitectureReview,
} from "./arch-review.js";
import {
  applySecurityVerdict,
  finalizeSecurityReport,
  reportHasCriticalFindings,
  SecurityScanFailedError,
  securityVerdictPassed,
} from "./security.js";
import { runPostMergeSdlc as executePostMergeSdlc } from "./post-merge.js";
import { runDeterministicSast } from "./security-sast.js";
import {
  buildClaudeCodeSession,
  ClaudeCodeSessionRequiredError,
  formatClaudeCodeSessionComment,
  resolveImplementRuntime,
} from "./runtime-profile.js";
import { resolveRetryPolicy, sleepWithBackoff } from "./retry-policy.js";
import {
  checkTokenBudget,
  getIssueTokenUsage,
  formatTokenBudgetEscalation,
} from "./token-budget.js";


export interface DispatchResult {
  agentId: string;
  contract: Record<string, unknown>;
  usage: { input: number; output: number };
  nextAgent?: string;
  nextWorkflow?: string;
}

export class Dispatcher {
  claude: ClaudeRuntimeClient;
  github: GitHubClient;
  projectDir: string;
  platformRoot: string;
  auditSession: AuditSession | null = null;
  private issueCommentsBody = "";

  constructor(opts?: {
    projectDir?: string;
    platformRoot?: string;
    githubToken?: string;
    anthropicKey?: string;
  }) {
    this.projectDir = opts?.projectDir ?? getProjectDir();
    this.platformRoot = opts?.platformRoot ?? getPlatformRoot();
    this.claude = new ClaudeRuntimeClient();
    this.github = new GitHubClient(opts?.githubToken);
  }

  async dispatchAgent(
    issueNumber: number,
    agentId: string,
    extra?: { prNumber?: number; requireArchitectureReview?: boolean }
  ): Promise<DispatchResult> {
    const def = loadRuntimeDef(agentId);
    if (!def.enabled && !isQualityAgent(agentId)) {
      throw new Error(`Agent ${agentId} is not enabled for runtime`);
    }

    const startMs = Date.now();
    this.auditSession?.recordAgentStarted(agentId);
    let usage = { input: 0, output: 0 };

    const manifest = loadManifest(this.projectDir);
    if (!isAgentLicensed(agentId, manifest.purchased_agents, this.platformRoot)) {
      throw new Error(
        `Agent ${agentId} is not licensed — add to manifest purchased_agents or buy a package`
      );
    }
    const compat = checkAgentInputContracts(
      agentId,
      issueNumber,
      this.loadContract.bind(this),
      { requireArchitectureReview: extra?.requireArchitectureReview }
    );
    if (!compat.ok) {
      const msg = `Missing input contracts for ${agentId}: ${compat.missing.join(", ")}`;
      this.auditSession?.recordAgentFailed(agentId, {
        durationMs: Date.now() - startMs,
        errors: [msg],
      });
      throw new Error(msg);
    }

    const tokenUsage = getIssueTokenUsage(
      this.projectDir,
      issueNumber,
      this.auditSession?.getRunningTokenUsage()
    );
    const budgetCheck = checkTokenBudget(manifest, tokenUsage);
    if (!budgetCheck.allowed) {
      await this.github.addLabels(issueNumber, ["agent-route:blocked"]);
      await this.github.addIssueComment(
        issueNumber,
        formatTokenBudgetEscalation(
          issueNumber,
          tokenUsage,
          budgetCheck.limit_usd!
        )
      );
      this.auditSession?.recordTokenBudgetBlocked({
        estimatedUsd: tokenUsage.estimated_usd,
        limitUsd: budgetCheck.limit_usd!,
        tokens: { input: tokenUsage.input, output: tokenUsage.output },
      });
      throw new Error(budgetCheck.reason ?? "token budget exceeded");
    }

    const monthlyBlock = checkMonthlyBudgetBlock(manifest, this.projectDir);
    if (monthlyBlock.blocked) {
      const label = monthlyBlock.alert?.triggered?.label ?? "cost:blocked";
      await this.github.addLabels(issueNumber, [label, "agent-route:blocked"]);
      if (monthlyBlock.alert) {
        await this.github.addIssueComment(
          issueNumber,
          formatCostAlertComment(monthlyBlock.alert, "monthly", issueNumber)
        );
        this.auditSession?.recordCostAlert({
          used_percent: monthlyBlock.alert.used_percent,
          label,
          action: monthlyBlock.alert.triggered?.action ?? "block_dispatch",
        });
      }
      throw new Error(monthlyBlock.reason ?? "monthly budget exceeded");
    }

    if (manifest.token_budget?.monthly_usd) {
      const costReport = buildCostReport({
        projectDir: this.projectDir,
        manifest,
      });
      const monthlyAlert = evaluateMonthlyCostAlerts(manifest, costReport);
      if (
        monthlyAlert.triggered &&
        monthlyAlert.triggered.threshold_percent >= 70 &&
        monthlyAlert.triggered.threshold_percent < 100
      ) {
        await this.github.addLabels(issueNumber, [monthlyAlert.triggered.label]);
        if (monthlyAlert.triggered.threshold_percent >= 90) {
          await this.github.addIssueComment(
            issueNumber,
            formatCostAlertComment(monthlyAlert, "monthly", issueNumber)
          );
        }
        this.auditSession?.recordCostAlert({
          used_percent: monthlyAlert.used_percent,
          label: monthlyAlert.triggered.label,
          action: monthlyAlert.triggered.action,
        });
      }
    }

    const retryPolicy = resolveRetryPolicy(def);

    if (agentId === "architecture-review-agent" && extra?.prNumber) {
      await this.github.addLabels(issueNumber, [ARCH_REVIEW_LABELS.pending]);
      await this.github.addLabels(extra.prNumber, [ARCH_REVIEW_LABELS.pending]);
    }

    try {
    const agentMod = getAgentModule(agentId);
    const skillsText = loadSkillsForAgent(def, agentMod.skillIds);
    const fileHints = this.getFileHints(issueNumber, agentId);

    let prDiff: string | undefined;
    if (
      (agentId === "review-agent" ||
        agentId === "architecture-review-agent" ||
        agentId === "security-agent" ||
        agentId === "docs-agent") &&
      extra?.prNumber
    ) {
      prDiff = await this.fetchPrDiff(extra.prNumber);
    }

    const context = await buildContextFromGitHub(
      this.github,
      this.projectDir,
      issueNumber,
      agentId,
      skillsText,
      { fileHints, prDiff, prNumber: extra?.prNumber, dispatchId: this.auditSession?.runId }
    );
    saveContextPackArtifact(this.projectDir, issueNumber, agentId, context);
    this.auditSession?.recordContextPackBuilt(agentId, context);

    const outputName = getOutputContractName(def.output_contract);
    let contract: Record<string, unknown> | null = null;
    let selfReviewPassed = true;
    let lastErrors: string[] = [];
    let lastResponseSnippet = "";

    if (isImplementAgent(agentId)) {
      const impl = await this.runImplementWithSelfReview(
        agentId,
        def,
        contextPackToAgentPrompt(context),
        retryPolicy,
        issueNumber
      );
      contract = impl.contract;
      usage = impl.usage;
      selfReviewPassed = impl.selfReviewPassed;
    } else {
      const system = this.buildSystemPrompt(agentId, def);
      const userMessage = `${contextPackToAgentPrompt(context)}\n\nExecute now. Set issue_id to ${issueNumber}. Emit the required JSON contract in a \`\`\`ai-platform-contract fence only.`;

      for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt++) {
        if (attempt > 0) {
          await sleepWithBackoff(retryPolicy.backoffMs, attempt);
        }
        const result = await this.claude.invoke({
          agentId,
          model: def.model,
          maxTokens: def.max_tokens,
          system,
          userMessage:
            attempt === 0
              ? userMessage
              : `${userMessage}\n\nPrevious response invalid (${lastErrors.join("; ") || "unparseable"}). Return valid ${outputName}@1.0 JSON in a \`\`\`ai-platform-contract fence only.`,
          maxRetries: 2,
          contractName: outputName,
        });
        usage = {
          input: usage.input + result.usage.input,
          output: usage.output + result.usage.output,
        };
        lastResponseSnippet = result.text.slice(-800);
        contract = result.contract
          ? normalizeContract(result.contract, outputName, issueNumber)
          : null;

        if (contract && contract.contract === outputName) {
          const mod = getAgentModule(agentId);
          if (mod.normalizeOutput) {
            contract = mod.normalizeOutput(contract);
          }
          if (agentId === "architecture-review-agent" && extra?.prNumber) {
            contract.pr_number = extra.prNumber;
          }
          const v = validateContract(outputName, contract);
          const agentErrs = mod.validateOutput?.(contract) ?? [];
          const validation = runContractValidation({
            agentId,
            issueId: issueNumber,
            contractName: outputName,
            data: contract,
          });
          this.auditSession?.recordContractValidation({
            agentId,
            targetContract: outputName,
            valid: validation.valid,
            errors: validation.errors,
            semanticErrors: validation.semantic_errors,
          });
          lastErrors = [
            ...(v.errors ?? []),
            ...agentErrs,
            ...validation.errors,
            ...validation.semantic_errors,
          ];
          if (v.valid && agentErrs.length === 0 && validation.valid) break;
        } else {
          lastErrors = result.contract
            ? [`Expected contract ${outputName}, got ${result.contract?.contract}`]
            : ["no parseable ai-platform-contract JSON in response"];
        }
        contract = null;
      }
    }

    if (!contract) {
      await this.github.addLabels(issueNumber, [
        def.failure_handling.label ?? "agent-route:blocked",
      ]);
      const detail =
        typeof lastErrors !== "undefined" && lastErrors.length
          ? `: ${lastErrors.join("; ")}`
          : "";
      console.error(`[${agentId}] last response tail:\n${lastResponseSnippet}`);
      this.auditSession?.recordAgentFailed(agentId, {
        durationMs: Date.now() - startMs,
        errors: lastErrors.length ? lastErrors : ["failed to produce valid contract"],
        usage,
      });
      if (lastErrors.length) {
        const failedValidation = runContractValidation({
          agentId,
          issueId: issueNumber,
          contractName: outputName,
          data: { contract: outputName, version: "1.0", issue_id: issueNumber },
        });
        failedValidation.valid = false;
        failedValidation.errors = lastErrors;
        await this.github.addIssueComment(
          issueNumber,
          formatValidationFailureComment(failedValidation)
        );
      }
      throw new Error(`${agentId} failed to produce valid ${outputName}${detail}`);
    }

    await this.publishValidatedContract(agentId, issueNumber, contract, outputName);

    await this.applyAgentSideEffects(agentId, issueNumber, contract, extra);

    const report = buildExecutionReport({
      agentId,
      issueId: issueNumber,
      task: `issue-${issueNumber}`,
      durationMs: Date.now() - startMs,
      tokens: usage,
      outputContract: contract,
      selfReviewPassed,
    });
    saveExecutionReport(this.projectDir, issueNumber, report);

    let nextAgent = def.next_agent;
    if (nextAgent === "dynamic") {
      const triage = this.loadContract(issueNumber, "TriageResult");
      nextAgent = resolveImplementAgent(triage);
    }

    this.auditSession?.recordAgentCompleted({
      agentId,
      contract,
      usage,
      durationMs: Date.now() - startMs,
      selfReviewPassed,
    });

    return {
      agentId,
      contract,
      usage,
      nextAgent: nextAgent !== "dynamic" ? nextAgent : undefined,
      nextWorkflow: def.next_workflow,
    };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("failed to produce valid")) {
        this.auditSession?.recordAgentFailed(agentId, {
          durationMs: Date.now() - startMs,
          errors: [msg],
          usage,
        });
      }
      throw err;
    }
  }

  private async runImplementWithSelfReview(
    agentId: string,
    def: { model: string; max_tokens: number; retry: { max_attempts: number } },
    contextPrompt: string,
    retryPolicy: { maxAttempts: number; backoffMs: number[] },
    issueNumber: number
  ): Promise<{
    contract: Record<string, unknown>;
    usage: { input: number; output: number };
    selfReviewPassed: boolean;
  }> {
    const outputName = "CodeChanges";
    const system = this.buildSystemPrompt(agentId, {
      output_contract: "CodeChanges@1.0",
    });
    const userMessage = `${contextPrompt}${this.buildImplementScopePrompt(issueNumber)}\n\nImplement now. Emit CodeChanges@1.0 with complete file contents.`;

    let draft: Record<string, unknown> | null = null;
    let usage = { input: 0, output: 0 };

    for (let attempt = 0; attempt < retryPolicy.maxAttempts; attempt++) {
      if (attempt > 0) await sleepWithBackoff(retryPolicy.backoffMs, attempt);
      const result = await this.claude.invoke({
        agentId,
        model: def.model,
        maxTokens: def.max_tokens,
        system,
        userMessage,
        maxRetries: 2,
      });
      usage.input += result.usage.input;
      usage.output += result.usage.output;
      if (result.contract?.contract === outputName) {
        draft = result.contract;
        break;
      }
    }
    if (!draft) throw new Error(`${agentId}: no CodeChanges draft`);

    const selfReview = loadSelfReviewPrompt(agentId);
    const archRules = loadArchitecturalRules();
    const reviewResult = await this.claude.invoke({
      agentId,
      model: def.model,
      maxTokens: 4096,
      system: `${selfReview}\n\n${archRules}`,
      userMessage: `Review this draft and return FINAL CodeChanges@1.0 JSON only.\n\nDraft:\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\``,
      maxRetries: 2,
    });
    usage.input += reviewResult.usage.input;
    usage.output += reviewResult.usage.output;

    const final =
      reviewResult.contract?.contract === outputName
        ? reviewResult.contract
        : draft;
    const selfReviewPassed =
      reviewResult.text.toLowerCase().includes("self-review: pass") ||
      !reviewResult.text.toLowerCase().includes("self-review: fail");

    if (!selfReviewPassed) {
      final.escalation_recommended = true;
    }
    final.self_review_passed = selfReviewPassed;
    final.plan_task_coverage = final.plan_task_coverage ?? 1;

    const normalized = normalizeContract(final, outputName, issueNumber);
    const validation = runContractValidation({
      agentId,
      issueId: issueNumber,
      contractName: outputName,
      data: normalized,
    });
    this.auditSession?.recordContractValidation({
      agentId,
      targetContract: outputName,
      valid: validation.valid,
      errors: validation.errors,
      semanticErrors: validation.semantic_errors,
    });
    if (!validation.valid) {
      throw new Error(
        `${agentId}: CodeChanges validation failed: ${[...validation.errors, ...validation.semantic_errors].join("; ")}`
      );
    }

    const plan = this.loadContract(issueNumber, "ImplementationPlan");
    const planErrors = validateCodeChangesAgainstPlan(
      normalized as unknown as CodeChanges,
      plan
    );
    if (planErrors.length) {
      throw new Error(`${agentId}: plan scope violation: ${planErrors.join("; ")}`);
    }

    return { contract: normalized, usage, selfReviewPassed };
  }

  private async publishValidatedContract(
    agentId: string,
    issueNumber: number,
    contract: Record<string, unknown>,
    outputName: string
  ): Promise<void> {
    const validation = runContractValidation({
      agentId,
      issueId: issueNumber,
      contractName: outputName,
      data: contract,
    });
    if (!validation.valid) {
      await this.github.addIssueComment(
        issueNumber,
        formatValidationFailureComment(validation)
      );
      throw new Error(
        `${agentId}: contract failed validation: ${[...validation.errors, ...validation.semantic_errors].join("; ")}`
      );
    }

    saveArtifact(this.projectDir, issueNumber, agentId, contract);
    saveArtifact(
      this.projectDir,
      issueNumber,
      "contract-validator-agent",
      validation as unknown as Record<string, unknown>
    );
    await this.github.addIssueComment(
      issueNumber,
      formatContractComment(agentId, contract)
    );
    if (agentId === "architecture-review-agent" && contract.pr_number) {
      await this.github.addIssueComment(
        Number(contract.pr_number),
        formatContractComment(agentId, contract)
      );
    }
  }

  private buildImplementScopePrompt(issueNumber: number): string {
    const plan = this.loadContract(issueNumber, "ImplementationPlan") as {
      tasks?: { files?: string[]; description?: string }[];
    };
    const files = this.getFileHints(issueNumber, "plan-agent");
    if (!files.length) return "";
    const tasks = (plan.tasks ?? [])
      .map((t) => `- ${t.description ?? "task"} → ${(t.files ?? []).join(", ")}`)
      .join("\n");
    return `

## ImplementationPlan scope (strict)
Allowed files ONLY: ${files.join(", ")}
${tasks ? `\nTasks:\n${tasks}` : ""}

Do NOT add endpoints, files, or features outside this plan. Edit existing files minimally.`;
  }

  private async acquirePipelineLock(
    issueNumber: number,
    labels: string[]
  ): Promise<void> {
    if (labels.includes("agent-route:in-progress")) {
      throw new Error(
        `Issue #${issueNumber} pipeline already in progress (agent-route:in-progress)`
      );
    }
    if (
      labels.includes("agent-route:ready-to-merge") ||
      labels.includes("agent-route:merged")
    ) {
      throw new Error(`Issue #${issueNumber} pipeline already completed`);
    }
    await this.github.removeLabel(issueNumber, "agent-route:pending");
    await this.github.addLabels(issueNumber, ["agent-route:in-progress"]);
  }

  private async releasePipelineLock(issueNumber: number): Promise<void> {
    await this.github.removeLabel(issueNumber, "agent-route:in-progress");
  }

  private buildSystemPrompt(agentId: string, def: { output_contract: string }): string {
    const base = loadProductionSystemPromptWithOptimization(agentId, this.projectDir);
    const output = getOutputContractName(def.output_contract);
    const mod = getAgentModule(agentId);
    return `${base}\n\n## Agent module: ${mod.agentId}\n## Required output: ${output}@1.0\n${mod.buildOutputInstructions()}`;
  }

  private getFileHints(issueNumber: number, agentId: string): string[] {
    const plan = this.loadContract(issueNumber, "ImplementationPlan") as {
      tasks?: { files?: string[] }[];
    } | null;
    if (!plan?.tasks) return [];
    return plan.tasks.flatMap((t) => t.files ?? []);
  }

  private loadContract(issueNumber: number, name: string): Record<string, unknown> {
    return resolveContract(
      this.projectDir,
      issueNumber,
      name,
      this.issueCommentsBody
    );
  }

  private async applyAgentSideEffects(
    agentId: string,
    issueNumber: number,
    contract: Record<string, unknown>,
    extra?: { prNumber?: number }
  ) {
    if (agentId === "triage-agent") {
      await this.github.removeLabel(issueNumber, "agent-route:pending");
      const labels = (contract.labels_applied as string[]) ?? [
        "agent-route:planned",
        "risk:low",
      ];
      const filtered = labels.filter((l) => l !== "agent-route:pending");
      await this.github.addLabels(issueNumber, filtered);
    }
    if (agentId === "architecture-review-agent") {
      const prNumber = Number(contract.pr_number ?? extra?.prNumber ?? 0);
      await this.applyArchitectureReviewVerdict(issueNumber, prNumber, contract);
      if (!architectureReviewVerdictPassed(String(contract.verdict ?? "FAIL"))) {
        throw new ArchitectureReviewFailedError(
          issueNumber,
          prNumber,
          String(contract.verdict ?? "FAIL")
        );
      }
    }
  }

  private async applyPostReviewGates(
    issueNumber: number,
    prNumber: number,
    contract: Record<string, unknown>
  ) {
    const manifest = loadManifest(this.projectDir);
    const verdict = String(contract.verdict ?? "FAIL");
    const issue = await this.github.getIssue(issueNumber);
    const issueLabels = issue.labels.map((l) =>
      typeof l === "string" ? l : l.name ?? ""
    );

    const decision = evaluatePostReviewGates({
      manifest,
      verdict,
      issueLabels,
    });

    if (!decision.allowed) {
      if (decision.issueLabels.length) {
        await this.github.addLabels(issueNumber, decision.issueLabels);
      }
      if (decision.prLabels.length) {
        await this.github.addLabels(prNumber, decision.prLabels);
      }
      void notifySdlcEventSafe({
        projectDir: this.projectDir,
        issueBody: issue.body ?? undefined,
        event: {
          type: "review_fail",
          issue_number: issueNumber,
          pr_number: prNumber,
          title: issue.title,
        },
      });
      return;
    }

    if (decision.issueLabels.length) {
      await this.github.addLabels(issueNumber, decision.issueLabels);
    }
    if (decision.prLabels.length) {
      await this.github.addLabels(prNumber, decision.prLabels);
    }

    if (decision.comment) {
      await this.github.addIssueComment(issueNumber, decision.comment);
    }

    const v = verdict.toUpperCase();
    if (v === "PASS") {
      void notifySdlcEventSafe({
        projectDir: this.projectDir,
        issueBody: issue.body ?? undefined,
        event: {
          type: "review_pass",
          issue_number: issueNumber,
          pr_number: prNumber,
          title: issue.title,
        },
      });
    }
  }

  private async fetchPrDiff(prNumber: number): Promise<string> {
    const files = await this.github.getPullRequestFiles(prNumber);
    const parts: string[] = [];
    for (const f of files.slice(0, 20)) {
      parts.push(`### ${f.filename} (${f.status})\n${f.patch ?? ""}`);
    }
    return parts.join("\n\n");
  }

  /** Deterministic code-guard + CI before PR. */
  private async runQualityGate(
    issueNumber: number,
    changes: CodeChanges,
    issueBody: string,
    implementAgentId?: string
  ): Promise<VerificationResultRecord> {
    const manifest = loadManifest(this.projectDir);
    const gateStart = Date.now();
    this.auditSession?.recordAgentStarted("qa-agent");

    const guard = validateCodeChanges(
      changes,
      manifest,
      this.loadContract(issueNumber, "ImplementationPlan"),
      implementAgentId
    );
    let ci: CiRunResult = {
      success: false,
      ci_status: "skipped",
      workspace: "",
      commands: [],
      duration_ms: 0,
      error: "code guard failed — CI not run",
    };

    if (guard.valid) {
      console.log(`[qa-agent] running CI in sandbox (${manifest.runtime_profile ?? "node"})`);
      ci = runCiWithChanges(this.projectDir, changes, manifest);
    }

    const verification = buildVerificationResult({
      issueId: issueNumber,
      issueBody,
      guard,
      ci,
    });

    saveArtifact(
      this.projectDir,
      issueNumber,
      "qa-agent",
      verification as unknown as Record<string, unknown>
    );
    await this.github.addIssueComment(issueNumber, formatVerificationComment(verification));

    const usage = { input: 0, output: 0 };
    if (verification.ready_for_merge) {
      this.auditSession?.recordAgentCompleted({
        agentId: "qa-agent",
        contract: verification as unknown as Record<string, unknown>,
        usage,
        durationMs: Date.now() - gateStart,
      });
      if (isQualityAgent("qa-agent")) {
        const report = buildExecutionReport({
          agentId: "qa-agent",
          issueId: issueNumber,
          task: `issue-${issueNumber}`,
          durationMs: Date.now() - gateStart,
          tokens: usage,
          outputContract: verification as unknown as Record<string, unknown>,
        });
        saveExecutionReport(this.projectDir, issueNumber, report);
      }
    } else {
      this.auditSession?.recordAgentFailed("qa-agent", {
        durationMs: Date.now() - gateStart,
        errors: [
          ...verification.code_guard_errors,
          verification.ci_error ?? `ci_status: ${verification.ci_status}`,
        ],
        usage,
      });
      await this.github.addLabels(issueNumber, ["agent-route:blocked"]);
      throw new Error(
        `QA gate failed: ${[...verification.code_guard_errors, verification.ci_error].filter(Boolean).join("; ")}`
      );
    }

    return verification;
  }

  private enforceReviewAgainstVerification(
    review: Record<string, unknown>,
    verification: VerificationResultRecord
  ): Record<string, unknown> {
    if (verification.ready_for_merge && verification.ci_status === "passed") {
      return review;
    }
    const out: Record<string, unknown> = { ...review, verdict: "FAIL" };
    const findings = (out.findings as unknown[]) ?? [];
    out.findings = [
      ...findings,
      {
        severity: "critical",
        file: "VerificationResult",
        line: 0,
        message: `QA gate failed: ci_status=${verification.ci_status}, ready_for_merge=${verification.ready_for_merge}`,
        category: "qa",
      },
    ];
    out.summary = "Review FAIL: QA/CI verification did not pass.";
    return out;
  }

  async runPostMerge(
    issueNumber: number,
    opts: {
      prNumber: number;
      mergeSha?: string;
      mergedBy?: string;
      mergeMethod?: string;
    }
  ) {
    const manifest = loadManifest(this.projectDir);
    const audit = new AuditSession({
      projectDir: this.projectDir,
      issueId: issueNumber,
      projectId: manifest.project_id,
    });
    this.auditSession = audit;
    try {
      const result = await executePostMergeSdlc(this, {
        issueNumber,
        ...opts,
      });
      audit.recordPostMergeCompleted(opts.prNumber, result.release.tag);
      audit.save();
      const issue = await this.github.getIssue(issueNumber);
      void notifySdlcEventSafe({
        projectDir: this.projectDir,
        issueBody: issue.body ?? undefined,
        event: {
          type: "merged",
          issue_number: issueNumber,
          pr_number: opts.prNumber,
          title: issue.title,
        },
      });
      return result;
    } catch (err) {
      audit.finalizeFailure(err);
      audit.save();
      throw err;
    } finally {
      this.auditSession = null;
    }
  }

  async runPipeline(
    issueNumber: number,
    opts?: { fromAgent?: string }
  ): Promise<{
    status?: "success" | "waiting" | "rejected";
    reason?: string;
    triage: Record<string, unknown>;
    workflow: WorkflowDecisionRecord;
    plan?: Record<string, unknown>;
    codeChanges?: CodeChanges;
    verification?: VerificationResultRecord;
    prNumber?: number;
    review?: Record<string, unknown>;
    security?: Record<string, unknown>;
    pipelineRun: Record<string, unknown>;
    execution_plan: string;
  }> {
    const manifest = loadManifest(this.projectDir);
    const audit = new AuditSession({
      projectDir: this.projectDir,
      issueId: issueNumber,
      projectId: manifest.project_id,
    });
    this.auditSession = audit;
    audit.recordPipelineStarted();

    if (!opts?.fromAgent) {
      const issuePreview = await this.github.getIssue(issueNumber);
      const previewLabels = issuePreview.labels.map((l) =>
        typeof l === "string" ? l : l.name ?? ""
      );
      const lifecycle = evaluateProjectLifecycle({
        projectDir: this.projectDir,
        manifest,
        issueLabels: previewLabels,
        platformRoot: this.platformRoot,
      });
      if (lifecycle.enabled && !lifecycle.development_enabled) {
        await this.github.addLabels(issueNumber, ["agent-route:blocked"]);
        await this.github.addIssueComment(
          issueNumber,
          formatLifecycleBlockComment(lifecycle)
        );
        audit.finalizeFailure(
          new Error(
            `lifecycle-gate: ${lifecycle.missing_for_development.join("; ")}`
          )
        );
        throw new Error(
          `Development pipeline blocked — lifecycle prerequisites: ${lifecycle.missing_for_development.join("; ")}`
        );
      }
    }

    if (opts?.fromAgent) {
      const latestPath = path.join(getAuditDir(this.projectDir, issueNumber), "latest.pipeline-run.json");
      let prevRunId = "unknown";
      if (fs.existsSync(latestPath)) {
        try {
          prevRunId =
            (JSON.parse(fs.readFileSync(latestPath, "utf8")) as { run_id?: string }).run_id ??
            prevRunId;
        } catch {
          /* keep unknown */
        }
      }
      audit.recordPipelineResumed(prevRunId, opts.fromAgent);
      const dlq = loadDlqEntry(this.projectDir, issueNumber);
      if (dlq?.status === "open") {
        resolveDlqEntry(this.projectDir, issueNumber, opts.fromAgent);
      }
    }

    let checkpoint = loadCheckpoint(this.projectDir, issueNumber);
    let triageContract: Record<string, unknown> = {};
    let workflowDecision!: WorkflowDecisionRecord;
    let planResult!: DispatchResult;
    let changes!: CodeChanges;
    let verification!: VerificationResultRecord;
    let prNumber = checkpoint?.pr_number ?? 0;
    let reviewResult!: DispatchResult;
    let securityResult!: DispatchResult;
    let lastAgent = "pipeline";
    let lastImplementAgent: string | undefined;
    let pipelineLockHeld = false;

    try {
      const issue = await this.github.getIssue(issueNumber);
      let labels = issue.labels.map((l) =>
        typeof l === "string" ? l : l.name ?? ""
      );

      this.issueCommentsBody = await fetchIssueCommentsBody(this.github, issueNumber);
      hydrateContractsFromComments(
        this.projectDir,
        issueNumber,
        this.issueCommentsBody
      );

      const resumeFrom = opts?.fromAgent;

      if (!resumeFrom) {
        await this.acquirePipelineLock(issueNumber, labels);
        pipelineLockHeld = true;
      }

      const existingTriage =
        this.loadContract(issueNumber, "TriageResult") ||
        loadArtifact(this.projectDir, issueNumber, "triage-agent");

      if (
        !resumeFrom &&
        !isStepCompleted(checkpoint, "triage-agent") &&
        !existingTriage?.contract
      ) {
        const triageResult = await this.dispatchAgent(issueNumber, "triage-agent");
        triageContract = triageResult.contract;
        checkpoint = markStepComplete(this.projectDir, issueNumber, "triage-agent");
        lastAgent = "triage-agent";
      } else {
        triageContract = existingTriage || {};
        if (!triageContract.contract) {
          throw new Error("resume requires TriageResult — run triage first or omit --from");
        }
      }

      workflowDecision =
        checkpoint?.workflow_decision ??
        (this.loadContract(issueNumber, "WorkflowDecision") as unknown as WorkflowDecisionRecord);

      if (workflowDecision?.risk_level) {
        workflowDecision = {
          ...workflowDecision,
          skip_stages: sanitizeWorkflowSkipStages(
            workflowDecision.risk_level,
            workflowDecision.skip_stages ?? []
          ),
        };
      }

      const resumingPastWorkflow =
        !!resumeFrom &&
        !["triage-agent", "workflow-agent"].includes(resumeFrom);

      if (!workflowDecision?.contract) {
        if (resumingPastWorkflow) {
          workflowDecision = buildDeterministicWorkflowDecision({
            issueId: issueNumber,
            triage: triageContract,
            labels,
            manifest,
          });
        } else {
          workflowDecision = await this.resolveWorkflowDecision(
            issueNumber,
            triageContract,
            labels
          );
          checkpoint = markStepComplete(this.projectDir, issueNumber, "workflow-agent", {
            workflow_decision: workflowDecision,
          });
          lastAgent = "workflow-agent";
        }
      } else if (!isStepCompleted(checkpoint, "workflow-agent")) {
        checkpoint = markStepComplete(this.projectDir, issueNumber, "workflow-agent", {
          workflow_decision: workflowDecision,
        });
      }

      const steps = buildExecutionPlan(workflowDecision, manifest);
      const startIdx = opts?.fromAgent
        ? resolveStartIndex(steps, opts.fromAgent)
        : 0;

      await this.github.addIssueComment(
        issueNumber,
        [
          "<!-- ai-platform-execution-plan -->",
          "## Execution plan",
          `**Path:** \`${workflowDecision.path_key}\` · **Risk:** ${workflowDecision.risk_level} · **Steps:** ${steps.length}`,
          "",
          describeExecutionPlan(steps),
          opts?.fromAgent
            ? `\n_Resuming from step ${startIdx + 1} (\`${opts.fromAgent}\`)._`
            : "",
        ].join("\n")
      );

      for (let i = startIdx; i < steps.length; i++) {
        const step = steps[i];
        if (isStepCompleted(checkpoint, step.id)) {
          if (
            step.type === "agent" &&
            step.agentId &&
            step.agentId !== "triage-agent" &&
            step.agentId !== "workflow-agent" &&
            !agentStepHasOutput(
              this.projectDir,
              issueNumber,
              step.agentId,
              this.issueCommentsBody
            )
          ) {
            // stale checkpoint without artifact — re-run step
          } else {
            continue;
          }
        }

        const prevAgent = lastAgent;

        switch (step.type) {
          case "agent": {
            if (step.agentId === "triage-agent" || step.agentId === "workflow-agent") {
              break;
            }
            if (
              step.agentId === "plan-agent" ||
              step.agentId === "technical-spec-agent"
            ) {
              const archGate = evaluateArchitectReviewGate(manifest, labels);
              if (!archGate.allowed) {
                if (archGate.issueLabels.length) {
                  await this.github.addLabels(issueNumber, archGate.issueLabels);
                }
                if (archGate.comment) {
                  await this.github.addIssueComment(issueNumber, archGate.comment);
                }
                throw new Error(archGate.reason ?? "architect_review_gate blocked");
              }
            }
            if (step.agentId === "architecture-review-agent") {
              if (!changes) {
                changes = this.loadCodeChanges(issueNumber);
              }
              if (!prNumber) {
                const impl = loadArtifact<{ pr_number?: number }>(
                  this.projectDir,
                  issueNumber,
                  "implementation-result"
                );
                prNumber = impl?.pr_number ?? 0;
              }
              const archSkipped = shouldSkipArchitectureReview({
                manifest,
                workflowDecision,
                triage: triageContract,
                labels,
                changes,
              });
              if (archSkipped) {
                lastAgent = "architecture-review-agent";
                checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
                  workflow_decision: workflowDecision,
                  arch_review: "skipped",
                });
                break;
              }
              await this.dispatchAgent(
                issueNumber,
                "architecture-review-agent",
                { prNumber }
              );
              await this.postHandoff(
                issueNumber,
                prevAgent,
                "architecture-review-agent",
                step.stage,
                ["ArchitectureReviewReport"]
              );
              lastAgent = "architecture-review-agent";
              labels = [
                ...labels.filter((l) => l !== ARCH_REVIEW_LABELS.pending),
                ARCH_REVIEW_LABELS.passed,
              ];
              checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
                workflow_decision: workflowDecision,
                arch_review: "passed",
                pr_number: prNumber,
              });
              break;
            }
            const result = await this.dispatchAgent(issueNumber, step.agentId!);
            if (step.agentId === "plan-agent") {
              planResult = result;
            }
            await this.postHandoff(
              issueNumber,
              prevAgent,
              step.agentId!,
              step.stage,
              [String(result.contract.contract ?? step.agentId)],
              { fromContract: result.contract, stageCount: steps.length }
            );
            lastAgent = step.agentId!;
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
            });
            break;
          }
          case "architect-gate": {
            const productSpec = this.loadContract(issueNumber, "ProductSpec");
            const gateSkipped = shouldSkipArchitectGate({
              manifest,
              triage: triageContract,
              labels,
              hasProductSpec: productSpec?.contract === "ProductSpec",
            });
            if (!gateSkipped) {
              labels = await this.runArchitectGateStep(
                issueNumber,
                manifest,
                triageContract,
                labels
              );
            }
            lastAgent = "architect-gate";
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
              architect_gate: gateSkipped ? "skipped" : "approved",
            });
            break;
          }
          case "implement": {
            const implementId = resolveImplementAgent(triageContract, labels);
            const plan = this.loadContract(issueNumber, "ImplementationPlan");
            const runtime = resolveImplementRuntime(manifest, {
              plan,
              triage: triageContract,
            });
            if (runtime === "claude-code") {
              await this.startClaudeCodeSession(
                issueNumber,
                implementId,
                plan,
                manifest
              );
              throw new ClaudeCodeSessionRequiredError(issueNumber, implementId);
            }
            const implResult = await this.dispatchAgent(issueNumber, implementId);
            changes = implResult.contract as unknown as CodeChanges;
            await this.postHandoff(issueNumber, prevAgent, implementId, step.stage, ["CodeChanges"], {
              fromContract: implResult.contract,
              stageCount: steps.length,
            });
            lastAgent = implementId;
            lastImplementAgent = implementId;
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
            });
            break;
          }
          case "qa-gate": {
            if (!changes) {
              changes = this.loadCodeChanges(issueNumber);
            }
            const guardAgent =
              lastImplementAgent ??
              this.resolveImplementAgentFromArtifacts(issueNumber, triageContract, labels);
            verification = await this.runQualityGate(
              issueNumber,
              changes,
              issue.body ?? "",
              guardAgent
            );
            lastAgent = "qa-agent";
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
            });
            break;
          }
          case "pr-create": {
            if (!changes) {
              changes = this.loadCodeChanges(issueNumber);
            }
            prNumber = await GitHubClient.applyCodeChanges(
              this.github,
              changes,
              issue.title,
              issueNumber,
              { agentId: lastImplementAgent }
            );
            verification.pr_number = prNumber;
            saveArtifact(
              this.projectDir,
              issueNumber,
              "qa-agent",
              verification as unknown as Record<string, unknown>
            );
            audit.recordPrCreated(prNumber);
            void notifySdlcEventSafe({
              projectDir: this.projectDir,
              issueBody: issue.body ?? undefined,
              event: {
                type: "pr_created",
                issue_number: issueNumber,
                pr_number: prNumber,
                title: issue.title,
              },
            });
            saveArtifact(this.projectDir, issueNumber, "implementation-result", {
              contract: "ImplementationResult",
              version: "1.0",
              issue_id: issueNumber,
              pr_number: prNumber,
              branch: changes.branch,
              files_changed: changes.files.length,
            });
            saveArtifact(this.projectDir, issueNumber, "review-context", {
              contract: "ReviewContext",
              version: "1.0",
              pr_number: prNumber,
            });
            lastAgent = "pr-create";
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
              pr_number: prNumber,
            });
            break;
          }
          case "review": {
            if (!prNumber) {
              const impl = loadArtifact<{ pr_number?: number }>(
                this.projectDir,
                issueNumber,
                "implementation-result"
              );
              prNumber = impl?.pr_number ?? 0;
            }
            if (!changes) {
              changes = this.loadCodeChanges(issueNumber);
            }
            const archRequired = isArchitectureReviewRequired({
              manifest,
              workflowDecision,
              triage: triageContract,
              labels,
              changes,
            });
            const archPre = evaluateArchitectureReviewPrecondition(archRequired, labels);
            if (!archPre.allowed) {
              if (archPre.issueLabels.length) {
                await this.github.addLabels(issueNumber, archPre.issueLabels);
              }
              if (archPre.prLabels.length && prNumber) {
                await this.github.addLabels(prNumber, archPre.prLabels);
              }
              if (archPre.comment) {
                await this.github.addIssueComment(issueNumber, archPre.comment);
              }
              throw new Error(archPre.reason ?? "architecture review blocked");
            }
            reviewResult = await this.dispatchAgent(issueNumber, "review-agent", {
              prNumber,
              requireArchitectureReview: archRequired,
            });
            if (!verification) {
              verification = this.loadContract(
                issueNumber,
                "VerificationResult"
              ) as unknown as VerificationResultRecord;
            }
            const finalReview = this.enforceReviewAgainstVerification(
              reviewResult.contract,
              verification
            );
            reviewResult.contract = getAgentModule("review-agent").normalizeOutput
              ? getAgentModule("review-agent").normalizeOutput!(finalReview)
              : finalReview;
            await applyReviewVerdict(this.github, prNumber, reviewResult.contract);
            await this.applyPostReviewGates(
              issueNumber,
              prNumber,
              reviewResult.contract
            );
            lastAgent = "review-agent";
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
              pr_number: prNumber,
            });
            break;
          }
          case "security": {
            if (!prNumber) {
              const impl = loadArtifact<{ pr_number?: number }>(
                this.projectDir,
                issueNumber,
                "implementation-result"
              );
              prNumber = impl?.pr_number ?? 0;
            }
            if (!changes) {
              changes = this.loadCodeChanges(issueNumber);
            }
            if (!reviewResult?.contract) {
              reviewResult = {
                agentId: "review-agent",
                contract: this.loadContract(issueNumber, "ReviewReport"),
                usage: { input: 0, output: 0 },
              };
            }
            const reviewVerdict = String(reviewResult.contract.verdict ?? "FAIL").toUpperCase();
            if (reviewVerdict !== "PASS") {
              throw new Error("security-agent requires review-agent PASS");
            }

            const sast = runDeterministicSast(this.projectDir, changes.files);
            saveArtifact(
              this.projectDir,
              issueNumber,
              "sast-scan",
              sast as unknown as Record<string, unknown>
            );

            securityResult = await this.dispatchAgent(issueNumber, "security-agent", {
              prNumber,
            });
            const merged = finalizeSecurityReport(securityResult.contract, sast);
            const normalized = getAgentModule("security-agent").normalizeOutput
              ? getAgentModule("security-agent").normalizeOutput!(merged)
              : merged;
            securityResult.contract = normalized;
            saveArtifact(this.projectDir, issueNumber, "security-agent", normalized);
            await this.github.addIssueComment(
              issueNumber,
              formatContractComment("security-agent", normalized)
            );

            await applySecurityVerdict(
              this.github,
              issueNumber,
              prNumber,
              normalized,
              manifest,
              reviewVerdict
            );

            if (
              !securityVerdictPassed(String(normalized.verdict)) ||
              reportHasCriticalFindings(normalized)
            ) {
              throw new SecurityScanFailedError(
                issueNumber,
                prNumber,
                String(normalized.verdict ?? "FAIL")
              );
            }

            lastAgent = "security-agent";
            checkpoint = markStepComplete(this.projectDir, issueNumber, step.id, {
              workflow_decision: workflowDecision,
              pr_number: prNumber,
            });
            break;
          }
        }
      }

      if (!planResult) {
        planResult = {
          agentId: "plan-agent",
          contract: this.loadContract(issueNumber, "ImplementationPlan"),
          usage: { input: 0, output: 0 },
        };
      }
      if (!changes) {
        changes = this.loadCodeChanges(issueNumber);
      }
      if (!verification) {
        verification = this.loadContract(
          issueNumber,
          "VerificationResult"
        ) as unknown as VerificationResultRecord;
      }
      if (!reviewResult) {
        reviewResult = {
          agentId: "review-agent",
          contract: this.loadContract(issueNumber, "ReviewReport"),
          usage: { input: 0, output: 0 },
        };
      }

      audit.finalizeSuccess({
        prNumber,
        reviewVerdict: String(reviewResult.contract.verdict ?? "UNKNOWN"),
      });

      return {
        status: "success",
        triage: triageContract,
        workflow: workflowDecision,
        plan: planResult.contract,
        codeChanges: changes,
        verification,
        prNumber,
        review: reviewResult.contract,
        security: securityResult?.contract,
        pipelineRun: audit.getPipelineRun() as unknown as Record<string, unknown>,
        execution_plan: describeExecutionPlan(steps),
      };
    } catch (err) {
      if (err instanceof ArchitectGatePendingError) {
        audit.finalizeWaiting({ reason: "architect-gate", step: "architect-gate" });
        return {
          status: "waiting",
          reason: "architect-gate",
          triage: triageContract,
          workflow: workflowDecision,
          pipelineRun: audit.getPipelineRun() as unknown as Record<string, unknown>,
          execution_plan: describeExecutionPlan(buildExecutionPlan(workflowDecision, manifest)),
        };
      }
      if (err instanceof ClaudeCodeSessionRequiredError) {
        audit.finalizeWaiting({ reason: "claude-code", step: "implement" });
        return {
          status: "waiting",
          reason: "claude-code",
          triage: triageContract,
          workflow: workflowDecision,
          pipelineRun: audit.getPipelineRun() as unknown as Record<string, unknown>,
          execution_plan: describeExecutionPlan(buildExecutionPlan(workflowDecision, manifest)),
        };
      }
      recordPipelineFailure(
        this.projectDir,
        issueNumber,
        lastAgent,
        err instanceof Error ? err.message : String(err),
        { workflow_decision: workflowDecision }
      );
      const dlqEntry = enqueueDlqEntry({
        projectDir: this.projectDir,
        projectId: manifest.project_id,
        issueId: issueNumber,
        failedStep: lastAgent,
        error: err instanceof Error ? err.message : String(err),
        runId: audit.getPipelineRun()?.run_id ?? audit.runId,
        checkpoint: loadCheckpoint(this.projectDir, issueNumber) ?? undefined,
      });
      audit.recordDlqEnqueued({
        failed_step: dlqEntry.failed_step,
        error: dlqEntry.error,
        attempts: dlqEntry.attempts,
      });
      await this.github.addLabels(issueNumber, ["pipeline:failed"]).catch(() => undefined);
      await this.github
        .addIssueComment(issueNumber, formatDlqComment(dlqEntry))
        .catch(() => undefined);
      audit.finalizeFailure(err);
      throw err;
    } finally {
      if (pipelineLockHeld) {
        await this.releasePipelineLock(issueNumber).catch(() => undefined);
      }
      audit.save();
      const pipelineRun = audit.getPipelineRun();
      if (pipelineRun) {
        saveArtifact(
          this.projectDir,
          issueNumber,
          "pipeline-run",
          pipelineRun as unknown as Record<string, unknown>
        );
      }
      await this.github.addIssueComment(issueNumber, audit.formatSummaryComment());
      this.auditSession = null;
    }
  }

  private async startClaudeCodeSession(
    issueNumber: number,
    implementAgent: string,
    plan: Record<string, unknown>,
    manifest: ReturnType<typeof loadManifest>
  ): Promise<void> {
    const branch = String(
      plan.branch_name ?? plan.branch ?? `ai-platform/issue-${issueNumber}`
    );
    const session = buildClaudeCodeSession({
      issueId: issueNumber,
      implementAgent,
      branch,
      allowedPaths: resolveAllowedPaths(manifest, implementAgent),
    });
    saveArtifact(
      this.projectDir,
      issueNumber,
      "claude-code-session",
      session as unknown as Record<string, unknown>
    );
    await this.github.addLabels(issueNumber, ["agent-route:blocked"]);
    await this.github.addIssueComment(
      issueNumber,
      formatClaudeCodeSessionComment(session)
    );
  }

  private resolveImplementAgentFromArtifacts(
    issueNumber: number,
    triage: Record<string, unknown>,
    labels: string[]
  ): string {
    for (const id of IMPLEMENT_AGENT_IDS) {
      const art = loadArtifact<CodeChanges>(this.projectDir, issueNumber, id);
      if (art?.contract === "CodeChanges") return id;
    }
    return resolveImplementAgent(triage, labels);
  }

  private async applyArchitectureReviewVerdict(
    issueNumber: number,
    prNumber: number,
    report: Record<string, unknown>
  ): Promise<void> {
    const verdict = String(report.verdict ?? "FAIL").toUpperCase();
    await this.github.removeLabel(issueNumber, ARCH_REVIEW_LABELS.pending).catch(
      () => undefined
    );
    if (prNumber) {
      await this.github.removeLabel(prNumber, ARCH_REVIEW_LABELS.pending).catch(
        () => undefined
      );
    }

    if (architectureReviewVerdictPassed(verdict)) {
      await this.github.addLabels(issueNumber, [ARCH_REVIEW_LABELS.passed]);
      if (prNumber) {
        await this.github.addLabels(prNumber, [ARCH_REVIEW_LABELS.passed]);
      }
      return;
    }

    await this.github.addLabels(issueNumber, [
      ARCH_REVIEW_LABELS.failed,
      "agent-route:blocked",
    ]);
    if (prNumber) {
      await this.github.addLabels(prNumber, [ARCH_REVIEW_LABELS.failed]);
    }
  }

  private async runArchitectGateStep(
    issueNumber: number,
    manifest: ReturnType<typeof loadManifest>,
    triageContract: Record<string, unknown>,
    labels: string[]
  ): Promise<string[]> {
    const productSpec = this.loadContract(issueNumber, "ProductSpec");
    const hasProductSpec = productSpec?.contract === "ProductSpec";

    if (
      shouldSkipArchitectGate({
        manifest,
        triage: triageContract,
        labels,
        hasProductSpec,
      })
    ) {
      return labels;
    }

    if (labels.includes(ARCHITECT_GATE_LABELS.rejected)) {
      throw new ArchitectGateRejectedError(issueNumber);
    }

    const architect = resolveArchitectHandle(manifest);
    const gateStatus = evaluateArchitectGateStatus(manifest, labels);

    if (gateStatus.approved) {
      const existing = loadArtifact<ArchitectReviewDecisionRecord>(
        this.projectDir,
        issueNumber,
        "architect-gate"
      );
      if (!existing || existing.decision !== "approved") {
        const decision = buildArchitectReviewDecision({
          issueId: issueNumber,
          decision: "approved",
          architect,
          productSpec: hasProductSpec ? productSpec : undefined,
          source: "human-label",
        });
        saveArtifact(
          this.projectDir,
          issueNumber,
          "architect-gate",
          decision as unknown as Record<string, unknown>
        );
        await this.github.addIssueComment(
          issueNumber,
          formatArchitectGateApprovedComment(decision)
        );
      }
      await this.github.removeLabel(issueNumber, ARCHITECT_GATE_LABELS.pending).catch(
        () => undefined
      );
      await this.github.removeLabel(issueNumber, "agent-route:blocked").catch(
        () => undefined
      );
      return labels.filter(
        (l) => l !== ARCHITECT_GATE_LABELS.pending && l !== "agent-route:blocked"
      );
    }

    const pendingDecision = buildArchitectReviewDecision({
      issueId: issueNumber,
      decision: "pending",
      architect,
      productSpec: hasProductSpec ? productSpec : undefined,
      source: "human-label",
    });
    saveArtifact(
      this.projectDir,
      issueNumber,
      "architect-gate",
      pendingDecision as unknown as Record<string, unknown>
    );
    await this.github.addLabels(issueNumber, [
      ARCHITECT_GATE_LABELS.pending,
      "agent-route:blocked",
    ]);
    await this.github.addIssueComment(
      issueNumber,
      formatArchitectGateEscalationComment({
        issueId: issueNumber,
        architect,
        productSpec: hasProductSpec ? productSpec : undefined,
        decision: pendingDecision,
      })
    );
    throw new ArchitectGatePendingError(issueNumber);
  }

  private async resolveWorkflowDecision(
    issueNumber: number,
    triage: Record<string, unknown>,
    labels: string[]
  ): Promise<WorkflowDecisionRecord> {
    const manifest = loadManifest(this.projectDir);
    const fallback = buildDeterministicWorkflowDecision({
      issueId: issueNumber,
      triage,
      labels,
      manifest,
    });

    try {
      const def = loadRuntimeDef("workflow-agent");
      if (def.enabled) {
        const result = await this.dispatchAgent(issueNumber, "workflow-agent");
        const normalized = normalizeWorkflowDecision(
          result.contract,
          issueNumber,
          fallback
        );
        normalized.path_key = fallback.path_key;
        if (!normalized.skip_stages.length) {
          normalized.skip_stages = fallback.skip_stages;
        }
        saveArtifact(
          this.projectDir,
          issueNumber,
          "workflow-agent",
          normalized as unknown as Record<string, unknown>
        );
        return normalized;
      }
    } catch (err) {
      console.warn(
        `[workflow-agent] LLM routing failed, using deterministic rules: ${err instanceof Error ? err.message : err}`
      );
    }

    await this.persistWorkflowDecision(issueNumber, fallback);
    return fallback;
  }

  private async persistWorkflowDecision(
    issueNumber: number,
    decision: WorkflowDecisionRecord
  ): Promise<void> {
    saveArtifact(
      this.projectDir,
      issueNumber,
      "workflow-agent",
      decision as unknown as Record<string, unknown>
    );
    await this.github.addIssueComment(
      issueNumber,
      formatContractComment("workflow-agent", decision as unknown as Record<string, unknown>)
    );
  }

  private async postHandoff(
    issueNumber: number,
    fromAgent: string,
    toAgent: string,
    stage: string,
    contractsPassed: string[],
    opts?: { fromContract?: Record<string, unknown>; stageCount?: number }
  ): Promise<void> {
    if (fromAgent === "pipeline") return;

    const fromContract =
      opts?.fromContract ??
      (contractsPassed[0]
        ? (this.loadContract(issueNumber, contractsPassed[0]) as Record<string, unknown>)
        : {});

    const useSummarizer =
      opts?.stageCount != null ? isLongPath(opts.stageCount) : true;

    const handoff = useSummarizer
      ? await summarizeHandoff({
          issueId: issueNumber,
          fromAgent,
          toAgent,
          stage,
          contractsPassed,
          fromContract: fromContract ?? {},
          claude: this.claude,
          useLlm: loadRuntimeDef("handoff-summarizer-agent").enabled,
        })
      : buildHandoff({
          issueId: issueNumber,
          fromAgent,
          toAgent,
          stage,
          summary: `Handoff from ${fromAgent} to ${toAgent} (${stage})`,
          contractsPassed,
        });

    saveHandoffSummary(this.projectDir, issueNumber, handoff);
    await this.github.addIssueComment(issueNumber, formatHandoffComment(handoff));
  }

  private loadCodeChanges(issueNumber: number): CodeChanges {
    for (const id of [
      "backend-implement-agent",
      "frontend-implement-agent",
      "fullstack-implement-agent",
      "infra-implement-agent",
    ]) {
      const art = loadArtifact<CodeChanges>(this.projectDir, issueNumber, id);
      if (art?.contract === "CodeChanges") return art;
    }
    throw new Error("No CodeChanges artifact found");
  }
}
