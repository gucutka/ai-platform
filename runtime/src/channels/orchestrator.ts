import { getCloudAgentClient } from "../cloud-agent-client.js";
import { loadManifest } from "../context-builder.js";
import { getPlatformRoot } from "../config.js";
import {
  defaultAgentForPhase,
  loadChannelsConfig,
  resolveChannelBinding,
} from "./config.js";
import {
  appendConversationHistory,
  formatHistoryForPrompt,
  loadConversationHistory,
  loadKnowledgeSnippet,
  readManifestSnippet,
} from "./conversation-prompts.js";
import {
  buildArchitectureContextParts,
  evaluateArchitectureReadiness,
} from "./architecture-context.js";
import {
  buildDevelopmentContextParts,
  evaluateDevelopmentReadiness,
} from "./development-context.js";
import { parseChannelAgentTurn, parseChannelTurnFromRecord } from "./channel-turn.js";
import { SLACK_REPLY_FORMAT } from "./slack-reply-format.js";
import { applyChannelActions } from "./actions.js";
import { getChannelAdapter } from "./registry.js";
import { getOrCreateChannelSession, saveChannelSession } from "./session-store.js";
import type {
  ChannelTurnResult,
  InboundChannelEvent,
  OutboundChannelMessage,
  ChannelConversationSession,
} from "./types.js";
import { GitHubClient } from "../github.js";
import { formatLifecycleBlockComment, evaluateProjectLifecycle } from "../project-lifecycle.js";

export interface ProcessChannelOpts {
  projectDir: string;
  provider: string;
  rawPayload: unknown;
  rawBody?: string;
  headers?: Record<string, string | undefined>;
  webhookSecret?: string;
  sendReply?: boolean;
  github?: GitHubClient;
  /** Override binding phase (stdio / CLI tests) */
  phaseOverride?: import("./types.js").LifecyclePhaseId;
}

export interface ProcessChannelBatchResult {
  contract: "ChannelBatchResult";
  version: "1.0";
  results: ChannelTurnResult[];
  challenge?: string;
}

export async function processChannelInbound(
  opts: ProcessChannelOpts
): Promise<ProcessChannelBatchResult> {
  const adapter = getChannelAdapter(opts.provider);

  if (opts.rawBody && adapter.verifyInbound) {
    const ok = adapter.verifyInbound({
      rawBody: opts.rawBody,
      headers: opts.headers ?? {},
      secret: opts.webhookSecret ?? process.env.CHANNEL_WEBHOOK_SECRET ?? process.env.SLACK_SIGNING_SECRET,
    });
    if (!ok) throw new Error("Channel webhook signature verification failed");
  }

  if (opts.provider === "slack") {
    const { slackUrlVerificationResponse, isDuplicateSlackDelivery } = await import(
      "./adapters/slack/adapter.js"
    );
    const challenge = slackUrlVerificationResponse(opts.rawPayload);
    if (challenge) {
      return { contract: "ChannelBatchResult", version: "1.0", results: [], challenge };
    }
    if (isDuplicateSlackDelivery(opts.rawPayload)) {
      return { contract: "ChannelBatchResult", version: "1.0", results: [] };
    }
  }

  const config = loadChannelsConfig(opts.projectDir);
  if (!config.enabled) {
    throw new Error("Channel integration disabled in channels.yaml");
  }

  const events = adapter.parseInbound(opts.rawPayload);
  const results: ChannelTurnResult[] = [];

  for (const event of events) {
    results.push(await processOneEvent(event, opts, adapter));
  }

  return { contract: "ChannelBatchResult", version: "1.0", results };
}

async function processOneEvent(
  event: InboundChannelEvent,
  opts: ProcessChannelOpts,
  adapter: ReturnType<typeof getChannelAdapter>
): Promise<ChannelTurnResult> {
  const config = loadChannelsConfig(opts.projectDir);
  let binding =
    resolveChannelBinding(config, event.address.channel_id) ??
    {
      channel_id: event.address.channel_id,
      phase: "discovery" as const,
      agent_id: defaultAgentForPhase("discovery"),
    };

  if (opts.phaseOverride) {
    binding = {
      ...binding,
      phase: opts.phaseOverride,
      agent_id: defaultAgentForPhase(opts.phaseOverride),
    };
  }

  let manifest;
  try {
    manifest = loadManifest(opts.projectDir);
  } catch {
    manifest = {
      platform_version: "2.1.0",
      project_id: binding.channel_id,
    };
  }

  const session = getOrCreateChannelSession({
    projectDir: opts.projectDir,
    projectId: manifest.project_id,
    address: event.address,
    phase: binding.phase,
    agentId: binding.agent_id,
  });

  if (binding.phase === "architecture") {
    const readiness = evaluateArchitectureReadiness({
      projectDir: opts.projectDir,
      manifest,
    });
    if (!readiness.ready) {
      return await emitBlockedTurn(
        opts,
        adapter,
        event,
        session,
        readiness.block_message ?? "Architecture phase is not ready."
      );
    }
  }

  if (binding.phase === "development") {
    const readiness = evaluateDevelopmentReadiness({
      projectDir: opts.projectDir,
      manifest,
    });
    if (!readiness.ready) {
      return await emitBlockedTurn(
        opts,
        adapter,
        event,
        session,
        readiness.block_message ?? "Development phase is not ready."
      );
    }
  }

  const history = loadConversationHistory(opts.projectDir, session.session_id);
  const lifecycleComment =
    evaluateProjectLifecycle({ projectDir: opts.projectDir, manifest }).enabled ?
      formatLifecycleBlockComment(
        evaluateProjectLifecycle({ projectDir: opts.projectDir, manifest })
      )
    : "";

  const knowledgeContext =
    binding.phase === "architecture" ?
      buildArchitectureContextParts(opts.projectDir)
    : binding.phase === "development" ?
      buildDevelopmentContextParts(opts.projectDir)
    : [
        loadKnowledgeSnippet(opts.projectDir, "business"),
        loadKnowledgeSnippet(opts.projectDir, "product"),
        loadKnowledgeSnippet(opts.projectDir, "technical"),
      ];

  const contextParts = [
    readManifestSnippet(opts.projectDir),
    ...knowledgeContext,
    formatHistoryForPrompt(history),
    lifecycleComment,
  ].filter(Boolean);

  const slackDelivery = [
    "### Slack delivery",
    `channel_id: \`${event.address.channel_id}\``,
    event.address.thread_id ? `thread_ts: \`${event.address.thread_id}\`` : "thread_ts: _(top-level — use message ts as thread)_",
    "Use **emit_channel_turn** with your `reply` — the platform posts it to this channel/thread (Slack MCP optional).",
    SLACK_REPLY_FORMAT,
  ].join("\n\n");

  const userMessage = `${contextParts.join("\n\n")}\n\n${slackDelivery}\n\n### User message\n\n${event.text}`;

  const client = getCloudAgentClient();
  const llm = await client.invoke({
    agentId: binding.agent_id,
    userMessage,
    sessionId: session.cloud_session_id,
    projectDir: opts.projectDir,
    manifest,
  });

  session.cloud_session_id = llm.session_id;
  const turn =
    parseChannelTurnFromRecord(llm.channelTurn ?? undefined) ??
    parseChannelAgentTurn(llm.text);

  const github =
    opts.github ??
    (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY
      ? await GitHubClient.create()
      : undefined);

  const actionsApplied = await applyChannelActions(turn.actions, {
    projectDir: opts.projectDir,
    session,
    github,
  });

  if (turn.phase_complete) session.status = "completed";
  session.updated_at = new Date().toISOString();
  saveChannelSession(opts.projectDir, session);

  appendConversationHistory(opts.projectDir, session.session_id, event.text, turn.reply);

  let replyText = turn.reply;
  if (actionsApplied.length) {
    replyText += `\n\n---\n**Applied:** ${actionsApplied.map((a) => `\`${a}\``).join(", ")}`;
  }

  const outbound: OutboundChannelMessage = {
    contract: "OutboundChannelMessage",
    version: "1.0",
    address: event.address,
    text: replyText,
    thread_reply: true,
  };

  if (opts.sendReply !== false && adapter.sendReply && !llm.usedMcpSlack) {
    await adapter.sendReply(outbound, {
      token: process.env.SLACK_BOT_TOKEN,
    });
  } else if (llm.usedMcpSlack) {
    console.error("[channel] reply sent via Slack MCP");
  }

  return {
    contract: "ChannelTurnResult",
    version: "1.0",
    inbound: event,
    turn,
    outbound,
    session,
    actions_applied: actionsApplied,
  };
}

export async function processChannelMessageLocal(opts: {
  projectDir: string;
  text: string;
  channelId?: string;
  phase?: import("./types.js").LifecyclePhaseId;
}): Promise<ChannelTurnResult> {
  const batch = await processChannelInbound({
    projectDir: opts.projectDir,
    provider: "stdio",
    rawPayload: {
      text: opts.text,
      channel_id: opts.channelId ?? "local-dev",
    },
    sendReply: true,
    phaseOverride: opts.phase,
  });
  if (!batch.results[0]) throw new Error("No channel turn result");
  return batch.results[0];
}

async function emitBlockedTurn(
  opts: ProcessChannelOpts,
  adapter: ReturnType<typeof getChannelAdapter>,
  event: InboundChannelEvent,
  session: ChannelConversationSession,
  reply: string
): Promise<ChannelTurnResult> {
  const blockedTurn = {
    contract: "ChannelAgentTurn" as const,
    version: "1.0" as const,
    reply,
    actions: [],
  };
  session.updated_at = new Date().toISOString();
  saveChannelSession(opts.projectDir, session);
  appendConversationHistory(opts.projectDir, session.session_id, event.text, blockedTurn.reply);
  const outbound: OutboundChannelMessage = {
    contract: "OutboundChannelMessage",
    version: "1.0",
    address: event.address,
    text: blockedTurn.reply,
    thread_reply: true,
  };
  if (opts.sendReply !== false && adapter.sendReply) {
    await adapter.sendReply(outbound, { token: process.env.SLACK_BOT_TOKEN });
  }
  return {
    contract: "ChannelTurnResult",
    version: "1.0",
    inbound: event,
    turn: blockedTurn,
    outbound,
    session,
    actions_applied: [],
  };
}
