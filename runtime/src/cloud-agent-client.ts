import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ClaudeClient, type ClaudeInvokeOptions } from "./claude.js";
import {
  isAgentLicensed,
  loadCloudAgentManifest,
  resolveCloudAgentId,
  type CloudAgentManifest,
} from "./cloud-agent-catalog.js";
import { getPlatformRoot, getProjectDir } from "./config.js";
import { recordCommercialUsage } from "./commercial-usage.js";
import { loadAgentDefinition } from "./agent-definition.js";
import { getMcpAgentClient } from "./mcp-agent-client.js";
import { loadProductionSystemPrompt } from "./prompt-loader.js";
import type { Manifest } from "./types.js";

export interface CloudAgentSession {
  contract: "CloudAgentSession";
  version: "1.0";
  session_id: string;
  agent_id: string;
  cloud_agent_id?: string;
  sku: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface CloudAgentInvokeResult {
  text: string;
  contract: Record<string, unknown> | null;
  usage: { input: number; output: number };
  session_id: string;
  runtime: "cloud-agent";
  cloud_agent_id?: string;
  channelTurn?: Record<string, unknown> | null;
  usedMcpSlack?: boolean;
}

function sessionsDir(projectDir?: string): string {
  const base = projectDir ?? getProjectDir();
  return path.join(base, ".ai-platform", "cloud-sessions");
}

function sessionPath(sessionId: string, projectDir?: string): string {
  return path.join(sessionsDir(projectDir), `${sessionId}.json`);
}

export function buildIdempotencyKey(opts: {
  projectId: string;
  issueId?: number;
  stage: string;
  attempt?: number;
}): string {
  return `${opts.projectId}:${opts.issueId ?? 0}:${opts.stage}:${opts.attempt ?? 0}`;
}

export function createCloudAgentSession(opts: {
  agentId: string;
  idempotencyKey: string;
  projectDir?: string;
  platformRoot?: string;
}): CloudAgentSession {
  const manifest = loadCloudAgentManifest(opts.agentId, opts.platformRoot);
  const sessionId = crypto
    .createHash("sha256")
    .update(`${opts.idempotencyKey}:${opts.agentId}`)
    .digest("hex")
    .slice(0, 24);
  const now = new Date().toISOString();
  const session: CloudAgentSession = {
    contract: "CloudAgentSession",
    version: "1.0",
    session_id: sessionId,
    agent_id: opts.agentId,
    cloud_agent_id: resolveCloudAgentId(opts.agentId, opts.platformRoot),
    sku: manifest.sku,
    idempotency_key: opts.idempotencyKey,
    created_at: now,
    updated_at: now,
    message_count: 0,
  };
  const dir = sessionsDir(opts.projectDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath(sessionId, opts.projectDir), JSON.stringify(session, null, 2));
  return session;
}

export function loadCloudAgentSession(
  sessionId: string,
  projectDir?: string
): CloudAgentSession | null {
  const p = sessionPath(sessionId, projectDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as CloudAgentSession;
}

function resolveSystemPrompt(manifest: CloudAgentManifest, agentId: string): string {
  if (manifest.system_prompt?.trim()) return manifest.system_prompt.trim();
  const fromPack = loadProductionSystemPrompt(agentId);
  if (fromPack) return fromPack;
  return `You are ${manifest.cloud_agent_name}. ${manifest.description ?? ""}`.trim();
}

function contractNameFromManifest(manifest: CloudAgentManifest): string | undefined {
  const raw = manifest.output_contract;
  if (!raw) return undefined;
  return raw.replace(/@\d+\.\d+$/, "");
}

export class CloudAgentClient {
  private messages = new ClaudeClient();

  assertLicensed(agentId: string, manifest?: Manifest): void {
    const purchased = (manifest as Manifest & { purchased_agents?: string[] })
      ?.purchased_agents;
    if (!isAgentLicensed(agentId, purchased)) {
      throw new Error(
        `Agent ${agentId} is not licensed for this project (purchased_agents / package)`
      );
    }
  }

  async invoke(opts: {
    agentId: string;
    userMessage: string;
    system?: string;
    contractName?: string;
    sessionId?: string;
    idempotencyKey?: string;
    projectDir?: string;
    manifest?: Manifest;
    model?: string;
    maxTokens?: number;
  }): Promise<CloudAgentInvokeResult> {
    this.assertLicensed(opts.agentId, opts.manifest);

    const platformRoot = getPlatformRoot();
    const agentManifest = loadCloudAgentManifest(opts.agentId, platformRoot);
    const cloudAgentId = resolveCloudAgentId(opts.agentId, platformRoot);

    let session: CloudAgentSession;
    if (opts.sessionId) {
      session = loadCloudAgentSession(opts.sessionId, opts.projectDir) ??
        createCloudAgentSession({
          agentId: opts.agentId,
          idempotencyKey: opts.idempotencyKey ?? opts.sessionId,
          projectDir: opts.projectDir,
          platformRoot,
        });
    } else {
      session = createCloudAgentSession({
        agentId: opts.agentId,
        idempotencyKey:
          opts.idempotencyKey ??
          buildIdempotencyKey({
            projectId: opts.manifest?.project_id ?? "default",
            stage: opts.agentId,
          }),
        projectDir: opts.projectDir,
        platformRoot,
      });
    }

    if (cloudAgentId) {
      opts.userMessage = `[cloud_agent_id:${cloudAgentId}]\n${opts.userMessage}`;
    }

    let agentDef;
    try {
      agentDef = loadAgentDefinition(opts.agentId, platformRoot);
    } catch {
      agentDef = null;
    }

    const useMcpRuntime =
      agentDef &&
      (agentDef.mcp_servers?.length ||
        agentDef.tools?.some((t) => t.type === "mcp_toolset" || t.type === "platform_toolset"));

    if (useMcpRuntime && agentDef) {
      const mcp = getMcpAgentClient();
      const mcpResult = await mcp.invoke({
        definition: agentDef,
        userMessage: opts.userMessage,
        systemAppend:
          opts.system && opts.system !== agentDef.system ? opts.system : undefined,
      });

      session.message_count += 1;
      session.updated_at = new Date().toISOString();
      session.cloud_agent_id = cloudAgentId;
      fs.writeFileSync(
        sessionPath(session.session_id, opts.projectDir),
        JSON.stringify(session, null, 2)
      );

      if (opts.projectDir && (mcpResult.usage.input > 0 || mcpResult.usage.output > 0)) {
        recordCommercialUsage({
          projectDir: opts.projectDir,
          agentId: opts.agentId,
          source: "cloud-agent",
          tokens: mcpResult.usage,
          sessionId: session.session_id,
        });
      }

      return {
        text: mcpResult.text,
        contract: mcpResult.contract,
        channelTurn: mcpResult.channelTurn,
        usedMcpSlack: mcpResult.usedMcpSlack,
        usage: mcpResult.usage,
        session_id: session.session_id,
        runtime: "cloud-agent",
        cloud_agent_id: cloudAgentId,
      };
    }

    const invokeOpts: ClaudeInvokeOptions = {
      model: opts.model ?? agentManifest.model,
      maxTokens: opts.maxTokens ?? agentManifest.max_tokens,
      system: opts.system ?? resolveSystemPrompt(agentManifest, opts.agentId),
      userMessage: opts.userMessage,
      contractName: opts.contractName ?? contractNameFromManifest(agentManifest),
    };

    const result = await this.messages.invoke(invokeOpts);

    session.message_count += 1;
    session.updated_at = new Date().toISOString();
    session.cloud_agent_id = cloudAgentId;
    fs.writeFileSync(
      sessionPath(session.session_id, opts.projectDir),
      JSON.stringify(session, null, 2)
    );

    if (opts.projectDir && (result.usage.input > 0 || result.usage.output > 0)) {
      recordCommercialUsage({
        projectDir: opts.projectDir,
        agentId: opts.agentId,
        source: "cloud-agent",
        tokens: result.usage,
        sessionId: session.session_id,
      });
    }

    return {
      ...result,
      session_id: session.session_id,
      runtime: "cloud-agent",
      cloud_agent_id: cloudAgentId,
    };
  }
}

export function getCloudAgentClient(): CloudAgentClient {
  return new CloudAgentClient();
}
