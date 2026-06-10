/**
 * Claude runtime — Messages API (default) or Cloud Agent sessions (catalog-backed).
 */
import { CloudAgentClient } from "./cloud-agent-client.js";
import { ClaudeClient, type ClaudeInvokeOptions } from "./claude.js";
import { loadManifest } from "./context-builder.js";
import { getProjectDir } from "./config.js";

export type ClaudeRuntimeMode = "messages" | "cloud-agents";

export function resolveClaudeRuntimeMode(): ClaudeRuntimeMode {
  const mode = (process.env.CLAUDE_RUNTIME ?? "messages").toLowerCase();
  return mode === "cloud-agents" ? "cloud-agents" : "messages";
}

export interface ClaudeRuntime {
  invoke(opts: ClaudeInvokeOptions & { agentId?: string; sessionId?: string }): Promise<{
    text: string;
    contract: Record<string, unknown> | null;
    usage: { input: number; output: number };
    runtime: ClaudeRuntimeMode;
    session_id?: string;
    cloud_agent_id?: string;
  }>;
}

class MessagesRuntime implements ClaudeRuntime {
  private inner = new ClaudeClient();

  async invoke(opts: ClaudeInvokeOptions & { agentId?: string }) {
    const result = await this.inner.invoke(opts);
    return { ...result, runtime: "messages" as const };
  }
}

class CloudAgentsRuntime implements ClaudeRuntime {
  private fallback = new ClaudeClient();
  private cloud = new CloudAgentClient();

  async invoke(opts: ClaudeInvokeOptions & { agentId?: string; sessionId?: string }) {
    if (!opts.agentId) {
      const result = await this.fallback.invoke(opts);
      return { ...result, runtime: "messages" as const };
    }

    try {
      let manifest;
      try {
        manifest = loadManifest(getProjectDir());
      } catch {
        manifest = undefined;
      }

      const result = await this.cloud.invoke({
        agentId: opts.agentId,
        userMessage: opts.userMessage,
        system: opts.system,
        contractName: opts.contractName,
        sessionId: opts.sessionId,
        manifest,
        model: opts.model,
        maxTokens: opts.maxTokens,
      });

      return {
        text: result.text,
        contract: result.contract,
        usage: result.usage,
        runtime: "cloud-agents" as const,
        session_id: result.session_id,
        cloud_agent_id: result.cloud_agent_id,
      };
    } catch (err) {
      console.warn(
        `[claude-runtime] cloud-agent invoke failed, falling back to messages: ${
          err instanceof Error ? err.message : err
        }`
      );
      const result = await this.fallback.invoke(opts);
      return { ...result, runtime: "messages" as const };
    }
  }
}

export function createClaudeRuntime(mode?: ClaudeRuntimeMode): ClaudeRuntime {
  const resolved = mode ?? resolveClaudeRuntimeMode();
  if (resolved === "cloud-agents") return new CloudAgentsRuntime();
  return new MessagesRuntime();
}

/** Drop-in for Dispatcher — wraps invoke with runtime selection. */
export class ClaudeRuntimeClient {
  private runtime: ClaudeRuntime;

  constructor(mode?: ClaudeRuntimeMode) {
    this.runtime = createClaudeRuntime(mode);
  }

  invoke(opts: ClaudeInvokeOptions & { agentId?: string; sessionId?: string }) {
    return this.runtime.invoke(opts);
  }
}
