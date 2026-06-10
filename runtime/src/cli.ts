#!/usr/bin/env node
import "./load-env.js"; // auto-load runtime/.env (shell env wins) — must stay first
import { Dispatcher } from "./dispatcher.js";
import { GitHubClient, loadArtifact, applyReviewVerdict, saveArtifact } from "./github.js";
import { getProjectDir, getPlatformRoot } from "./config.js";
import { normalizeContract, formatContractComment } from "./contracts.js";
import { IMPLEMENT_AGENT_IDS, loadRuntimeDef } from "./agents.js";
import { getAgentModule } from "./agents/index.js";
import { buildContextFromGitHub, loadManifest } from "./context-builder.js";
import { saveContextPackArtifact } from "./context-pack-store.js";
import {
  buildKnowledgeIndex,
  saveKnowledgeIndex,
  loadKnowledgeApprovals,
  knowledgeApprovalsPath,
  KNOWLEDGE_LAYERS,
  type KnowledgeLayer,
  type KnowledgeFileStatus,
} from "./knowledge-index.js";
import { loadSkillsForAgent } from "./skills.js";
import { runDeterministicSast } from "./security-sast.js";
import {
  approveReleaseResult,
  markReleasePublished,
} from "./post-merge.js";
import {
  runIssueRoute,
  runProjectSync,
  runQaStatusSync,
} from "./project-sync-runner.js";
import {
  buildCostReport,
  saveCostReport,
  formatCostReportComment,
} from "./cost-report.js";
import {
  evaluateLicenseStatus,
  listSellablePackages,
  loadCommercialConfig,
} from "./commercial.js";
import {
  buildCommercialSummary,
  formatCommercialSummaryMarkdown,
} from "./commercial-summary.js";
import { applyCostAlerts } from "./cost-alerts.js";
import { exportAuditTrail, exportAuditTrailToS3 } from "./audit-export.js";
import {
  listDlqEntries,
  loadDlqEntry,
  suggestResumeAgent,
} from "./failure-recovery.js";
import { resolveGitHubToken } from "./github-auth.js";
import {
  planWebhookDispatch,
  verifyWebhookSignature,
  type WebhookPayload,
} from "./webhook-receiver.js";
import { syncOptimizationHints } from "./optimization-loop.js";
import { onboardProject } from "./onboard-project.js";
import { createClientProject } from "./create-client-project.js";
import { provisionCloudAgents, registerCloudAgentId } from "./provision-cloud-agents.js";
import {
  getCloudAgentClient,
  buildIdempotencyKey,
} from "./cloud-agent-client.js";
import {
  listSellableAgents,
  loadCloudAgentCatalog,
  loadCloudAgentManifest,
} from "./cloud-agent-catalog.js";
import {
  evaluateProjectLifecycle,
  formatLifecycleBlockComment,
} from "./project-lifecycle.js";
import {
  listAppTemplates,
  scaffoldFromTemplate,
} from "./scaffold-from-template.js";
import {
  processChannelInbound,
  processChannelMessageLocal,
  listChannelProviders,
  upsertChannelBinding,
  listAdrs,
  evaluateArchitectureReadiness,
  evaluateDevelopmentReadiness,
  writeAdrDraft,
  loadIssueChannelLinks,
} from "./channels/index.js";
import {
  notifySdlcEvent,
  listNotificationProviders,
  loadNotificationsConfig,
} from "./notifications/index.js";
import { listChannelSessions } from "./channels/session-store.js";
import { loadAgentDefinition, listAgentDefinitions } from "./agent-definition.js";
import { validateAgents } from "./validate-agents.js";
import { startSlackEventsServer } from "./slack-events-server.js";
import type { CodeChanges } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const projectDir = getArg(args, "--project-dir") ?? getProjectDir();
  const issue = parseInt(getArg(args, "--issue") ?? "0", 10);
  const agentId = getArg(args, "--agent");
  const prNumber = parseInt(getArg(args, "--pr") ?? "0", 10);

  process.env.PLATFORM_ROOT = getArg(args, "--platform-root") ?? getPlatformRoot();

  const localOnly = new Set([
    "onboard-project",
    "create-client-project",
    "scaffold-app",
    "list-app-templates",
    "provision-cloud-agents",
    "register-cloud-agent",
    "list-cloud-agents",
    "invoke-cloud-agent",
    "lifecycle-status",
    "channel-receive",
    "channel-chat",
    "channel-bind",
    "channel-status",
    "channel-providers",
    "architecture-status",
    "list-adrs",
    "architecture-chat",
    "draft-adr",
    "feature-chat",
    "development-status",
    "notify-sdlc-event",
    "notification-providers",
    "show-agent",
    "validate-agents",
    "slack-events-server",
    "list-agent-definitions",
    "optimization-sync",
    "dlq-list",
    "license-status",
    "list-sellable-packages",
    "commercial-summary",
    "cost-report",
    "audit-export",
    "github-token",
  ]);
  if (
    command &&
    !localOnly.has(command) &&
    !process.env.GITHUB_TOKEN
  ) {
    try {
      const auth = await resolveGitHubToken();
      process.env.GITHUB_TOKEN = auth.token;
      console.error(`GITHUB_AUTH_MODE=${auth.mode}`);
    } catch {
      /* dispatch may still fail with clear error */
    }
  }

  const dispatcher = new Dispatcher({ projectDir });

  switch (command) {
    case "dispatch":
      if (!issue || !agentId) {
        console.error("Usage: dispatch --issue N --agent agent-id [--pr N]");
        process.exit(1);
      }
      const result = await dispatcher.dispatchAgent(
        issue,
        agentId,
        prNumber ? { prNumber } : undefined
      );
      console.log(JSON.stringify(result, null, 2));
      if (result.nextAgent) {
        console.log(`NEXT_AGENT=${result.nextAgent}`);
      }
      if (result.nextWorkflow) {
        console.log(`NEXT_WORKFLOW=${result.nextWorkflow}`);
      }
      break;

    case "submit-code-changes":
      if (!issue) {
        console.error(
          "Usage: submit-code-changes --issue N --agent <implement-agent> --file PATH"
        );
        process.exit(1);
      }
      {
        const submitAgent = getArg(args, "--agent");
        const filePath = getArg(args, "--file");
        if (!submitAgent || !filePath) {
          console.error("submit-code-changes requires --agent and --file");
          process.exit(1);
        }
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
        const changes = normalizeContract(raw, "CodeChanges", issue) as unknown as CodeChanges;
        saveArtifact(projectDir, issue, submitAgent, changes as unknown as Record<string, unknown>);
        await dispatcher.github.addIssueComment(
          issue,
          formatContractComment(submitAgent, changes as unknown as Record<string, unknown>)
        );
        console.log(JSON.stringify(changes, null, 2));
        console.log("CODE_CHANGES_SUBMITTED=1");
      }
      break;

    case "knowledge-sync":
      {
        const manifest = loadManifest(projectDir);
        const index = buildKnowledgeIndex(projectDir, manifest);
        const out = saveKnowledgeIndex(projectDir, index);
        console.log(
          JSON.stringify(
            {
              path: out,
              knowledge_index_hash: index.knowledge_index_hash,
              stats: index.stats,
              layers: Object.fromEntries(
                KNOWLEDGE_LAYERS.map((l) => [
                  l,
                  {
                    layer_status: index.layers[l]?.layer_status,
                    files: index.layers[l]?.files.length ?? 0,
                  },
                ])
              ),
            },
            null,
            2
          )
        );
        console.log(`KNOWLEDGE_INDEX_HASH=${index.knowledge_index_hash}`);
      }
      break;

    case "knowledge-approve":
      {
        const layer = getArg(args, "--layer") as KnowledgeLayer | undefined;
        const status = (getArg(args, "--status") ?? "approved") as KnowledgeFileStatus;
        if (!layer || !(KNOWLEDGE_LAYERS as readonly string[]).includes(layer)) {
          console.error("Usage: knowledge-approve --layer business|product|technical [--status approved|draft]");
          process.exit(1);
        }
        if (status !== "approved" && status !== "draft") {
          console.error("--status must be approved or draft");
          process.exit(1);
        }
        const manifest = loadManifest(projectDir);
        const approvals = loadKnowledgeApprovals(projectDir);
        approvals.version = approvals.version ?? "1.0";
        approvals.layers = approvals.layers ?? {};
        approvals.layers[layer] = status;
        fs.mkdirSync(path.dirname(knowledgeApprovalsPath(projectDir)), { recursive: true });
        fs.writeFileSync(
          knowledgeApprovalsPath(projectDir),
          `# Knowledge Owner layer approval\n${YAML.stringify(approvals)}`
        );
        const index = buildKnowledgeIndex(projectDir, manifest);
        saveKnowledgeIndex(projectDir, index);
        console.log(`KNOWLEDGE_LAYER_${layer.toUpperCase()}=${status}`);
        console.log(`KNOWLEDGE_INDEX_HASH=${index.knowledge_index_hash}`);
      }
      break;

    case "security-scan":
      if (!issue) {
        console.error("Usage: security-scan --issue N --project-dir PATH");
        process.exit(1);
      }
      {
        let files: { path: string; content: string }[] | undefined;
        for (const id of IMPLEMENT_AGENT_IDS) {
          const art = loadArtifact<{ files?: { path: string; content: string }[] }>(
            projectDir,
            issue,
            id
          );
          if (art?.files?.length) {
            files = art.files;
            break;
          }
        }
        const sast = runDeterministicSast(projectDir, files);
        saveArtifact(projectDir, issue, "sast-scan", sast as unknown as Record<string, unknown>);
        console.log(JSON.stringify(sast, null, 2));
        console.log(`SAST_FINDINGS=${sast.findings.length}`);
      }
      break;

    case "build-context":
      if (!issue || !agentId) {
        console.error("Usage: build-context --issue N --agent agent-id [--project-dir PATH]");
        process.exit(1);
      }
      {
        const github = new GitHubClient();
        const def = loadRuntimeDef(agentId);
        const agentMod = getAgentModule(agentId);
        const skillsText = loadSkillsForAgent(def, agentMod.skillIds);
        const pack = await buildContextFromGitHub(
          github,
          projectDir,
          issue,
          agentId,
          skillsText,
          prNumber ? { prNumber } : undefined
        );
        const artifactPath = saveContextPackArtifact(projectDir, issue, agentId, pack);
        console.log(
          JSON.stringify(
            {
              context_pack_hash: pack.context_pack_hash,
              tier: pack.tier,
              path: artifactPath,
              token_budget: pack.token_budget,
              ref_count: pack.refs?.length ?? 0,
              file_count: pack.files.length,
            },
            null,
            2
          )
        );
        console.log(`CONTEXT_PACK_HASH=${pack.context_pack_hash}`);
        console.log(`CONTEXT_PACK_PATH=${artifactPath}`);
      }
      break;

    case "run-pipeline":
      if (!issue) {
        console.error("Usage: run-pipeline --issue N --project-dir PATH [--from agent-id]");
        process.exit(1);
      }
      {
        const fromAgent = getArg(args, "--from");
        const pipeline = await dispatcher.runPipeline(issue, fromAgent ? { fromAgent } : undefined);
        console.log(JSON.stringify(pipeline, null, 2));
        if (pipeline.status === "waiting") {
          console.log("PIPELINE_STATUS=waiting");
          console.log(`PIPELINE_REASON=${pipeline.reason ?? "unknown"}`);
          break;
        }
        console.log(`PR_NUMBER=${pipeline.prNumber ?? 0}`);
      }
      break;

    case "resume":
      if (!issue) {
        console.error("Usage: resume --issue N --from <agent-id> --project-dir PATH");
        process.exit(1);
      }
      {
        const fromAgent = getArg(args, "--from");
        if (!fromAgent) {
          console.error("resume requires --from <agent-id> (e.g. plan-agent)");
          process.exit(1);
        }
        const pipeline = await dispatcher.runPipeline(issue, { fromAgent });
        console.log(JSON.stringify(pipeline, null, 2));
        if (pipeline.status === "waiting") {
          console.log("PIPELINE_STATUS=waiting");
          console.log(`PIPELINE_REASON=${pipeline.reason ?? "unknown"}`);
          break;
        }
        console.log(`PR_NUMBER=${pipeline.prNumber ?? 0}`);
      }
      break;

    case "pr-create":
      if (!issue) {
        console.error("Usage: pr-create --issue N --project-dir PATH");
        process.exit(1);
      }
      await runPrCreate(projectDir, issue, dispatcher);
      break;

    case "post-merge":
      if (!issue || !prNumber) {
        console.error("Usage: post-merge --issue N --pr N [--merge-sha SHA] [--project-dir PATH]");
        process.exit(1);
      }
      {
        const mergedBy = getArg(args, "--merged-by");
        const mergeSha = getArg(args, "--merge-sha");
        const mergeMethod = getArg(args, "--merge-method");
        const result = await dispatcher.runPostMerge(issue, {
          prNumber,
          mergedBy,
          mergeSha,
          mergeMethod,
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`RELEASE_TAG_DRAFT=${result.release.tag}`);
      }
      break;

    case "release-approve":
      if (!issue) {
        console.error("Usage: release-approve --issue N [--approve true|false] [--project-dir PATH]");
        process.exit(1);
      }
      {
        const approveFlag = getArg(args, "--approve") ?? "true";
        const approve = approveFlag !== "false";
        const updated = approveReleaseResult(projectDir, issue, approve);
        if (!updated) {
          console.error("No ReleaseResult draft found — run post-merge first");
          process.exit(1);
        }
        console.log(JSON.stringify(updated, null, 2));
        console.log(`RELEASE_TAG=${updated.tag}`);
        console.log(`RELEASE_STATUS=${updated.status}`);
        if (getArg(args, "--publish") === "true") {
          const published = markReleasePublished(projectDir, issue);
          if (published) {
            await notifySdlcEvent({
              projectDir,
              event: {
                type: "released",
                issue_number: issue,
                release_tag: published.tag,
                title: published.release_notes?.split("\n")[0],
              },
            });
          }
          console.log("RELEASE_PUBLISHED=1");
        }
      }
      break;

    case "review":
      if (!issue || !prNumber) {
        console.error("Usage: review --issue N --pr N --project-dir PATH");
        process.exit(1);
      }
      const review = await dispatcher.dispatchAgent(issue, "review-agent", {
        prNumber,
      });
      await applyReviewVerdict(dispatcher.github, prNumber, review.contract);
      console.log(JSON.stringify(review, null, 2));
      break;

    case "sync-project":
      if (!issue) {
        console.error("Usage: sync-project --issue N [--no-comment] [--project-dir PATH]");
        process.exit(1);
      }
      {
        const noComment = getArg(args, "--no-comment") === "true";
        const syncResult = await runProjectSync({
          projectDir,
          issueNumber: issue,
          comment: !noComment,
        });
        console.log(JSON.stringify(syncResult, null, 2));
        console.log(`PROJECT_SYNC_REMOTE=${syncResult.remote_applied ? "1" : "0"}`);
      }
      break;

    case "qa-status-sync":
      if (!prNumber) {
        console.error("Usage: qa-status-sync --pr N --conclusion success|failure [--project-dir PATH]");
        process.exit(1);
      }
      {
        const conclusion = getArg(args, "--conclusion") ?? "success";
        const qa = await runQaStatusSync({
          projectDir,
          prNumber,
          conclusion,
        });
        console.log(JSON.stringify(qa, null, 2));
        if (qa.issueNumber) {
          console.log(`QA_ISSUE=${qa.issueNumber}`);
          console.log(`QA_LABEL=${qa.label}`);
        }
      }
      break;

    case "route-issue":
      if (!issue) {
        console.error("Usage: route-issue --issue N [--project-dir PATH]");
        process.exit(1);
      }
      {
        const routed = await runIssueRoute({
          projectDir,
          issueNumber: issue,
          dispatcher,
        });
        console.log(JSON.stringify(routed, null, 2));
        const wf = await dispatcher.dispatchAgent(issue, "workflow-agent");
        console.log(JSON.stringify(wf, null, 2));
        console.log("ROUTE_ISSUE=1");
      }
      break;

    case "cost-report":
      {
        const month = getArg(args, "--month");
        const manifest = loadManifest(projectDir);
        const report = buildCostReport({
          projectDir,
          manifest,
          month,
        });
        const out = saveCostReport(projectDir, report);
        if (process.env.GITHUB_TOKEN) {
          const github = new GitHubClient();
          await applyCostAlerts({
            github,
            manifest,
            projectDir,
            report,
            issueNumber: issue || undefined,
          });
          if (issue) {
            await github.addIssueComment(issue, formatCostReportComment(report));
          }
        }
        console.log(JSON.stringify(report, null, 2));
        console.log(`COST_REPORT_PATH=${out}`);
        console.log(`COST_USD=${report.totals.usd.toFixed(2)}`);
      }
      break;

    case "audit-export":
      {
        const manifest = loadManifest(projectDir);
        const month = getArg(args, "--month");
        const bucket = getArg(args, "--s3-bucket");
        const result = bucket
          ? await exportAuditTrailToS3({
              projectDir,
              projectId: manifest.project_id,
              month,
              bucket,
              prefix: getArg(args, "--s3-prefix"),
            })
          : exportAuditTrail({
              projectDir,
              projectId: manifest.project_id,
              month,
              issueId: issue || undefined,
            });
        console.log(JSON.stringify(result, null, 2));
        console.log(`AUDIT_EXPORT_EVENTS=${result.event_count}`);
      }
      break;

    case "dlq-list":
      {
        const entries = listDlqEntries(projectDir);
        console.log(JSON.stringify(entries, null, 2));
        console.log(`DLQ_OPEN=${entries.length}`);
      }
      break;

    case "dlq-resume":
      if (!issue) {
        console.error("Usage: dlq-resume --issue N [--from agent-id] [--project-dir PATH]");
        process.exit(1);
      }
      {
        const entry = loadDlqEntry(projectDir, issue);
        const fromAgent = getArg(args, "--from") ?? (entry ? suggestResumeAgent(entry) : undefined);
        if (!fromAgent) {
          console.error("No DLQ entry and no --from agent specified");
          process.exit(1);
        }
        const pipeline = await dispatcher.runPipeline(issue, { fromAgent });
        console.log(JSON.stringify(pipeline, null, 2));
        if (pipeline.status === "waiting") {
          console.log("PIPELINE_STATUS=waiting");
          console.log(`PIPELINE_REASON=${pipeline.reason ?? "unknown"}`);
          break;
        }
        console.log(`PR_NUMBER=${pipeline.prNumber ?? 0}`);
        console.log("DLQ_RESUME=1");
      }
      break;

    case "github-token":
      {
        const auth = await resolveGitHubToken();
        console.log(`GITHUB_TOKEN=${auth.token}`);
        console.log(`GITHUB_AUTH_MODE=${auth.mode}`);
        if (auth.expires_at) console.log(`GITHUB_TOKEN_EXPIRES=${auth.expires_at}`);
      }
      break;

    case "webhook-receive":
      {
        const payloadFile = getArg(args, "--payload-file");
        const event = getArg(args, "--event") ?? "issues";
        const signature = getArg(args, "--signature");
        const secret = process.env.AI_PLATFORM_WEBHOOK_SECRET;
        if (!payloadFile || !secret) {
          console.error(
            "Usage: webhook-receive --payload-file PATH --event issues [--signature sha256=...]"
          );
          process.exit(1);
        }
        const raw = fs.readFileSync(payloadFile, "utf8");
        if (signature && !verifyWebhookSignature(raw, signature, secret)) {
          console.error("Webhook signature verification failed");
          process.exit(1);
        }
        const payload = JSON.parse(raw) as WebhookPayload;
        const plan = planWebhookDispatch(event, payload);
        if (!plan) {
          console.log("WEBHOOK_NOOP=1");
          break;
        }
        console.log(JSON.stringify(plan, null, 2));
        console.log(`WEBHOOK_WORKFLOW=${plan.workflow}`);
        console.log(`WEBHOOK_ISSUE=${plan.issue_number}`);
      }
      break;

    case "optimization-sync":
      {
        const hints = syncOptimizationHints(projectDir);
        console.log(JSON.stringify(hints, null, 2));
        console.log(`OPTIMIZATION_AGENTS=${Object.keys(hints.agents).length}`);
      }
      break;

    case "onboard-project":
      {
        const target = getArg(args, "--target");
        const projectId = getArg(args, "--project-id");
        const tier = getArg(args, "--tier") ?? "standard";
        if (!target || !projectId) {
          console.error(
            "Usage: onboard-project --target PATH --project-id ID [--tier standard|enterprise|regulated]"
          );
          process.exit(1);
        }
        const result = onboardProject({
          targetDir: target,
          projectId,
          clientTier: tier,
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`ONBOARD_TARGET=${result.target_dir}`);
      }
      break;

    case "create-client-project":
      {
        const target = getArg(args, "--target");
        const projectId = getArg(args, "--project-id");
        const tier = getArg(args, "--tier") ?? "standard";
        const platformOwner = getArg(args, "--platform-owner");
        if (!target || !projectId || !platformOwner) {
          console.error(
            "Usage: create-client-project --target PATH --project-id ID --platform-owner ORG [--tier standard|enterprise|regulated] [--platform-root PATH]"
          );
          process.exit(1);
        }
        const result = createClientProject({
          targetDir: target,
          projectId,
          clientTier: tier,
          platformOwner,
          platformRoot: getArg(args, "--platform-root") ?? getPlatformRoot(),
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`CREATE_CLIENT_TARGET=${result.target_dir}`);
        console.log(`AI_PLATFORM_REPOSITORY=${result.platform_repository}`);
      }
      break;

    case "scaffold-app":
      {
        const target = getArg(args, "--target");
        const template = getArg(args, "--template");
        const projectId = getArg(args, "--project-id");
        const tier = getArg(args, "--tier");
        if (!target || !template || !projectId) {
          console.error(
            "Usage: scaffold-app --target PATH --template ID --project-id ID [--tier standard|enterprise|regulated]"
          );
          process.exit(1);
        }
        const result = scaffoldFromTemplate({
          targetDir: target,
          templateId: template,
          projectId,
          clientTier: tier,
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`SCAFFOLD_TARGET=${result.target_dir}`);
      }
      break;

    case "list-app-templates":
      {
        const templates = listAppTemplates();
        console.log(JSON.stringify(templates, null, 2));
      }
      break;

    case "provision-cloud-agents":
      {
        const dryRun = getArg(args, "--dry-run") === "true";
        const agentFilter = getArg(args, "--agents");
        const result = provisionCloudAgents({
          dryRun,
          agentIds: agentFilter ? agentFilter.split(",") : undefined,
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`CLOUD_AGENTS_PROVISIONED=${result.provisioned + result.updated}`);
      }
      break;

    case "register-cloud-agent":
      {
        const agent = getArg(args, "--agent");
        const cloudId = getArg(args, "--cloud-id");
        if (!agent || !cloudId) {
          console.error("Usage: register-cloud-agent --agent AGENT_ID --cloud-id CLOUD_AGENT_ID");
          process.exit(1);
        }
        const manifest = registerCloudAgentId({ agentId: agent, cloudAgentId: cloudId });
        console.log(JSON.stringify(manifest, null, 2));
      }
      break;

    case "list-cloud-agents":
      {
        const catalog = loadCloudAgentCatalog();
        const sellable = getArg(args, "--sellable") === "true";
        const agents = sellable
          ? listSellableAgents()
          : Object.keys(catalog.agents).map((id) => loadCloudAgentManifest(id));
        console.log(JSON.stringify(agents, null, 2));
      }
      break;

    case "license-status":
      {
        let manifest;
        try {
          manifest = loadManifest(projectDir);
        } catch {
          manifest = { platform_version: "2.1.0", project_id: path.basename(projectDir) };
        }
        console.log(JSON.stringify(evaluateLicenseStatus(manifest), null, 2));
      }
      break;

    case "list-sellable-packages":
      {
        const packages = listSellablePackages();
        const commercial = loadCommercialConfig();
        console.log(
          JSON.stringify(
            { packages, skus: commercial.skus, currency: commercial.currency },
            null,
            2
          )
        );
      }
      break;

    case "commercial-summary":
      {
        const month = getArg(args, "--month");
        let manifest;
        try {
          manifest = loadManifest(projectDir);
        } catch {
          manifest = { platform_version: "2.1.0", project_id: path.basename(projectDir) };
        }
        const summary = buildCommercialSummary({ projectDir, manifest, month });
        console.log(JSON.stringify(summary, null, 2));
        console.log(formatCommercialSummaryMarkdown(summary));
      }
      break;

    case "invoke-cloud-agent":
      {
        const agent = getArg(args, "--agent");
        const message = getArg(args, "--message");
        const session = getArg(args, "--session");
        if (!agent || !message) {
          console.error(
            "Usage: invoke-cloud-agent --agent AGENT_ID --message TEXT [--session SESSION_ID] [--project-dir PATH]"
          );
          process.exit(1);
        }
        let manifest;
        try {
          manifest = loadManifest(projectDir);
        } catch {
          manifest = undefined;
        }
        const client = getCloudAgentClient();
        const result = await client.invoke({
          agentId: agent,
          userMessage: message,
          sessionId: session,
          projectDir,
          manifest,
          idempotencyKey: buildIdempotencyKey({
            projectId: manifest?.project_id ?? "local",
            stage: agent,
          }),
        });
        console.log(JSON.stringify(result, null, 2));
        console.log(`CLOUD_SESSION=${result.session_id}`);
      }
      break;

    case "lifecycle-status":
      {
        const manifest = loadManifest(projectDir);
        const evaluation = evaluateProjectLifecycle({ projectDir, manifest });
        console.log(JSON.stringify(evaluation, null, 2));
        console.log(formatLifecycleBlockComment(evaluation));
      }
      break;

    case "list-agent-definitions":
      console.log(JSON.stringify(listAgentDefinitions(), null, 2));
      break;

    case "validate-agents":
      {
        const report = validateAgents();
        for (const w of report.warnings) console.error(`WARN ${w}`);
        for (const e of report.errors) console.error(`ERROR ${e}`);
        console.log(JSON.stringify(report, null, 2));
        if (!report.ok) process.exit(1);
      }
      break;

    case "show-agent":
      {
        const agent = getArg(args, "--agent");
        if (!agent) {
          console.error("Usage: show-agent --agent AGENT_ID");
          process.exit(1);
        }
        console.log(JSON.stringify(loadAgentDefinition(agent), null, 2));
      }
      break;

    case "slack-events-server":
      {
        const port = parseInt(getArg(args, "--port") ?? "3000", 10);
        startSlackEventsServer({ projectDir, port });
      }
      break;

    case "channel-providers":
      console.log(JSON.stringify(listChannelProviders(), null, 2));
      break;

    case "channel-bind":
      {
        const channelId = getArg(args, "--channel");
        const phase = getArg(args, "--phase") as
          | "intake"
          | "discovery"
          | "architecture"
          | "development"
          | undefined;
        const bindAgent = getArg(args, "--agent");
        if (!channelId || !phase) {
          console.error(
            "Usage: channel-bind --channel CHANNEL_ID --phase intake|discovery|architecture|development [--agent AGENT_ID]"
          );
          process.exit(1);
        }
        const config = upsertChannelBinding(projectDir, {
          channel_id: channelId,
          phase,
          agent_id:
            bindAgent ??
            ({
              intake: "project-intake-conversation-agent",
              discovery: "requirements-conversation-agent",
              architecture: "architecture-conversation-agent",
              development: "feature-intake-conversation-agent",
            }[phase] ?? "requirements-conversation-agent"),
          label: getArg(args, "--label"),
        });
        console.log(JSON.stringify(config, null, 2));
      }
      break;

    case "channel-status":
      {
        const sessions = listChannelSessions(projectDir);
        console.log(JSON.stringify(sessions, null, 2));
      }
      break;

    case "channel-chat":
      {
        const message = getArg(args, "--message");
        const channelId = getArg(args, "--channel") ?? "local-dev";
        const phase = getArg(args, "--phase") as
          | "intake"
          | "discovery"
          | "architecture"
          | "development"
          | undefined;
        if (!message) {
          console.error(
            "Usage: channel-chat --message TEXT [--channel CHANNEL_ID] [--phase PHASE] [--project-dir PATH]"
          );
          process.exit(1);
        }
        const result = await processChannelMessageLocal({
          projectDir,
          text: message,
          channelId,
          phase,
        });
        console.log(JSON.stringify(result, null, 2));
      }
      break;

    case "architecture-chat":
      {
        const message = getArg(args, "--message");
        const channelId = getArg(args, "--channel") ?? "arch-local";
        if (!message) {
          console.error(
            "Usage: architecture-chat --message TEXT [--channel CHANNEL_ID] [--project-dir PATH]"
          );
          process.exit(1);
        }
        const result = await processChannelMessageLocal({
          projectDir,
          text: message,
          channelId,
          phase: "architecture",
        });
        console.log(JSON.stringify(result, null, 2));
      }
      break;

    case "feature-chat":
      {
        const message = getArg(args, "--message");
        const channelId = getArg(args, "--channel") ?? "dev-local";
        if (!message) {
          console.error(
            "Usage: feature-chat --message TEXT [--channel CHANNEL_ID] [--project-dir PATH]"
          );
          process.exit(1);
        }
        const result = await processChannelMessageLocal({
          projectDir,
          text: message,
          channelId,
          phase: "development",
        });
        console.log(JSON.stringify(result, null, 2));
      }
      break;

    case "development-status":
      {
        let manifest;
        try {
          manifest = loadManifest(projectDir);
        } catch {
          manifest = { platform_version: "2.1.0", project_id: path.basename(projectDir) };
        }
        const readiness = evaluateDevelopmentReadiness({ projectDir, manifest });
        const links = loadIssueChannelLinks(projectDir);
        console.log(JSON.stringify({ readiness, issue_links: links }, null, 2));
      }
      break;

    case "notification-providers":
      console.log(JSON.stringify(listNotificationProviders(), null, 2));
      break;

    case "notify-sdlc-event":
      {
        const eventType = getArg(args, "--event") as
          | "pr_created"
          | "review_pass"
          | "merged"
          | "released"
          | undefined;
        if (!issue || !eventType) {
          console.error(
            "Usage: notify-sdlc-event --event pr_created|review_pass|merged|released --issue N [--pr N] [--project-dir PATH]"
          );
          process.exit(1);
        }
        const result = await notifySdlcEvent({
          projectDir,
          event: {
            type: eventType,
            issue_number: issue,
            pr_number: prNumber || undefined,
            release_tag: getArg(args, "--tag"),
            title: getArg(args, "--title"),
          },
        });
        console.log(JSON.stringify(result, null, 2));
      }
      break;

    case "architecture-status":
      {
        let manifest;
        try {
          manifest = loadManifest(projectDir);
        } catch {
          manifest = { platform_version: "2.1.0", project_id: path.basename(projectDir) };
        }
        const readiness = evaluateArchitectureReadiness({ projectDir, manifest });
        const adrs = listAdrs(projectDir);
        console.log(JSON.stringify({ readiness, adrs }, null, 2));
      }
      break;

    case "list-adrs":
      console.log(JSON.stringify(listAdrs(projectDir), null, 2));
      break;

    case "draft-adr":
      {
        const title = getArg(args, "--title");
        const context = getArg(args, "--context");
        const decision = getArg(args, "--decision");
        if (!title || !context || !decision) {
          console.error(
            "Usage: draft-adr --title TITLE --context TEXT --decision TEXT [--consequences TEXT] [--project-dir PATH]"
          );
          process.exit(1);
        }
        const result = writeAdrDraft(projectDir, {
          title,
          context,
          decision,
          consequences: getArg(args, "--consequences"),
        });
        console.log(JSON.stringify(result, null, 2));
      }
      break;

    case "channel-receive":
      {
        const provider = getArg(args, "--provider") ?? "webhook";
        const payloadFile = getArg(args, "--payload-file");
        const noSend = getArg(args, "--no-send-reply") === "true";
        if (!payloadFile) {
          console.error(
            "Usage: channel-receive --provider slack|webhook|stdio --payload-file PATH [--no-send-reply true]"
          );
          process.exit(1);
        }
        const rawBody = fs.readFileSync(payloadFile, "utf8");
        const rawPayload = JSON.parse(rawBody);
        const batch = await processChannelInbound({
          projectDir,
          provider,
          rawPayload,
          rawBody,
          sendReply: !noSend,
        });
        if (batch.challenge) {
          console.log(batch.challenge);
          break;
        }
        console.log(JSON.stringify(batch, null, 2));
      }
      break;

    default:
      console.log(`AI Platform Runtime

Commands:
  knowledge-sync [--project-dir PATH]
  security-scan --issue N [--project-dir PATH]
  knowledge-approve --layer business|product|technical [--status approved|draft]
  build-context --issue N --agent <agent-id> [--pr N]
  dispatch --issue N --agent <agent-id> [--pr N]
  submit-code-changes --issue N --agent <implement-agent> --file PATH
  run-pipeline --issue N --project-dir PATH [--from agent-id]
  resume --issue N --from <agent-id> --project-dir PATH
  pr-create --issue N --project-dir PATH
  post-merge --issue N --pr N [--merge-sha SHA] [--merged-by ACTOR]
  release-approve --issue N [--approve true|false]
  review --issue N --pr N --project-dir PATH
  sync-project --issue N [--no-comment true]
  qa-status-sync --pr N --conclusion success|failure
  route-issue --issue N
  cost-report [--month YYYY-MM] [--issue N]
  audit-export [--month YYYY-MM] [--issue N] [--s3-bucket NAME]
  dlq-list
  dlq-resume --issue N [--from agent-id]
  github-token
  webhook-receive --payload-file PATH --event issues [--signature sha256=...]
  optimization-sync
  onboard-project --target PATH --project-id ID [--tier standard|enterprise|regulated]
  create-client-project --target PATH --project-id ID --platform-owner ORG [--tier TIER]
  scaffold-app --target PATH --template ID --project-id ID [--tier TIER]
  list-app-templates
  provision-cloud-agents [--agents id1,id2] [--dry-run true]
  register-cloud-agent --agent AGENT_ID --cloud-id CLOUD_AGENT_ID
  list-cloud-agents [--sellable true]
  license-status [--project-dir PATH]
  list-sellable-packages
  commercial-summary [--month YYYY-MM] [--project-dir PATH]
  invoke-cloud-agent --agent AGENT_ID --message TEXT [--session ID]
  lifecycle-status [--project-dir PATH]
  list-agent-definitions
  show-agent --agent AGENT_ID
  validate-agents
  slack-events-server [--port 3000] [--project-dir PATH]
  channel-providers
  channel-bind --channel ID --phase PHASE [--agent AGENT_ID]
  channel-status [--project-dir PATH]
  channel-chat --message TEXT [--channel ID] [--phase PHASE]
  architecture-chat --message TEXT [--channel ID]
  feature-chat --message TEXT [--channel ID]
  development-status [--project-dir PATH]
  architecture-status [--project-dir PATH]
  list-adrs [--project-dir PATH]
  draft-adr --title T --context C --decision D [--consequences TEXT]
  notification-providers
  notify-sdlc-event --event TYPE --issue N [--pr N]
  channel-receive --provider PROVIDER --payload-file PATH [--no-send-reply true]

On-demand agents: migration-agent (no full SDLC)
Implement agents: frontend | backend | fullstack | infra (routed by area label)
Claude Code: IMPLEMENT_RUNTIME=claude-code or manifest.agent_routing.complex_refactor
`);
  }
}

async function runPrCreate(
  projectDir: string,
  issueNumber: number,
  dispatcher: Dispatcher
) {
  const implementAgents = [...IMPLEMENT_AGENT_IDS];
  let changes: CodeChanges | null = null;
  for (const id of implementAgents) {
    const art = loadArtifact<CodeChanges>(projectDir, issueNumber, id);
    if (art?.contract === "CodeChanges") {
      changes = art;
      break;
    }
  }
  if (!changes) {
    throw new Error("No CodeChanges artifact found — run implement agent first");
  }
  const issue = await dispatcher.github.getIssue(issueNumber);
  let implementAgentId: string | undefined;
  for (const id of [
    "frontend-implement-agent",
    "backend-implement-agent",
    "fullstack-implement-agent",
    "infra-implement-agent",
  ]) {
    const art = loadArtifact<CodeChanges>(projectDir, issueNumber, id);
    if (art?.contract === "CodeChanges") {
      implementAgentId = id;
      break;
    }
  }
  const prNumber = await GitHubClient.applyCodeChanges(
    dispatcher.github,
    changes,
    issue.title,
    issueNumber,
    { agentId: implementAgentId }
  );
  const record = {
    contract: "ImplementationResult",
    version: "1.0",
    issue_id: issueNumber,
    pr_number: prNumber,
    branch: changes.branch,
    files_changed: changes.files.length,
  };
  fs.mkdirSync(
    path.join(projectDir, ".ai-platform", "runs", String(issueNumber)),
    { recursive: true }
  );
  fs.writeFileSync(
    path.join(projectDir, ".ai-platform", "runs", String(issueNumber), "pr.json"),
    JSON.stringify({ pr_number: prNumber }, null, 2)
  );
  console.log(`PR_NUMBER=${prNumber}`);
}

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
