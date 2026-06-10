/**
 * Claude Console–style agent definitions (.agent.yaml).
 * Single source of truth: name, system, model, mcp_servers, tools, metadata.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import { loadCloudAgentCatalog } from "./cloud-agent-catalog.js";

export interface McpServerDefinition {
  name: string;
  type: "url";
  url: string;
  /** Env var name for authorization_token (resolved at runtime) */
  authorization_token_env?: string;
}

export interface McpToolsetDefinition {
  type: "mcp_toolset";
  mcp_server_name: string;
  default_config?: {
    permission_policy?: { type: "always_allow" | "ask" };
    enabled?: boolean;
  };
}

export interface PlatformToolsetDefinition {
  type: "platform_toolset";
  actions?: string[];
}

export interface ContractToolsetDefinition {
  type: "contract_toolset";
  contract: string;
}

export type AgentToolDefinition =
  | McpToolsetDefinition
  | PlatformToolsetDefinition
  | ContractToolsetDefinition;

export interface AgentMetadata {
  agent_id: string;
  sku?: string;
  sellable?: boolean;
  cloud_agent_id?: string;
  cloud_agent_name?: string;
  output_contract?: string;
  phase?: string;
  template?: string;
  channel_modes?: string[];
}

export interface AgentDefinition {
  name: string;
  description?: string;
  model: string;
  max_tokens?: number;
  system: string;
  mcp_servers?: McpServerDefinition[];
  tools?: AgentToolDefinition[];
  metadata: AgentMetadata;
}

export function agentsDir(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "cloud-agents", "agents");
}

export function agentDefinitionPath(agentId: string, platformRoot?: string): string {
  return path.join(agentsDir(platformRoot), `${agentId}.agent.yaml`);
}

export function resolveAgentDefinitionPath(
  agentId: string,
  platformRoot?: string
): string {
  const root = platformRoot ?? getPlatformRoot();
  const catalog = loadCloudAgentCatalog(root);
  const entry = catalog.agents[agentId];
  if (!entry) {
    throw new Error(`Agent not in cloud catalog: ${agentId}`);
  }

  const agentFile =
    entry.agent ??
    (entry.manifest ?
      entry.manifest.replace(/^manifests\//, "agents/").replace(/\.yaml$/, ".agent.yaml")
    : null);

  if (agentFile) {
    const full = path.join(root, "cloud-agents", agentFile);
    if (fs.existsSync(full)) return full;
  }

  const defaultPath = agentDefinitionPath(agentId, root);
  if (fs.existsSync(defaultPath)) return defaultPath;

  throw new Error(`Agent definition not found for ${agentId}`);
}

export function loadAgentDefinition(
  agentId: string,
  platformRoot?: string
): AgentDefinition {
  const file = resolveAgentDefinitionPath(agentId, platformRoot);
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as AgentDefinition;
  if (!raw.metadata?.agent_id) {
    raw.metadata = { ...raw.metadata, agent_id: agentId } as AgentMetadata;
  }
  return raw;
}

export function listAgentDefinitions(platformRoot?: string): AgentDefinition[] {
  const dir = agentsDir(platformRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".agent.yaml"))
    .map((f) => loadAgentDefinition(f.replace(/\.agent\.yaml$/, ""), platformRoot));
}

export function agentHasMcpServer(def: AgentDefinition, name: string): boolean {
  return def.mcp_servers?.some((s) => s.name === name) ?? false;
}

export function agentUsesMcpToolset(def: AgentDefinition, serverName: string): boolean {
  return (
    def.tools?.some(
      (t) => t.type === "mcp_toolset" && t.mcp_server_name === serverName
    ) ?? false
  );
}

/** User OAuth token for Slack hosted MCP (xoxp-). Bot tokens (xoxb-) are NOT accepted. */
export function slackMcpOAuthToken(): string | undefined {
  const raw =
    process.env.SLACK_MCP_OAUTH_TOKEN ??
    process.env.SLACK_USER_OAUTH_TOKEN ??
    "";
  const token = raw.trim();
  if (!token) return undefined;
  // mcp.slack.com rejects bot/app tokens; only pass user OAuth bearer tokens.
  if (token.startsWith("xoxp-") || token.startsWith("xoxc-")) return token;
  return undefined;
}

export function resolveMcpServers(
  servers: McpServerDefinition[] | undefined
): Array<{
  type: "url";
  name: string;
  url: string;
  authorization_token?: string;
}> {
  if (!servers?.length) return [];
  return servers.flatMap((s) => {
    if (s.name === "slack" && s.url.includes("mcp.slack.com")) {
      const oauth = slackMcpOAuthToken();
      if (!oauth) {
        console.error(
          "[mcp] Slack hosted MCP skipped: set SLACK_MCP_OAUTH_TOKEN (xoxp- user OAuth). " +
            "SLACK_BOT_TOKEN works for Events API + chat.postMessage fallback, not mcp.slack.com."
        );
        return [];
      }
      return [
        {
          type: "url" as const,
          name: s.name,
          url: s.url,
          authorization_token: oauth,
        },
      ];
    }
    const tokenEnv = s.authorization_token_env;
    const token = tokenEnv ? process.env[tokenEnv] : undefined;
    return [
      {
        type: "url" as const,
        name: s.name,
        url: s.url,
        ...(token ? { authorization_token: token } : {}),
      },
    ];
  });
}

/** Legacy manifest shape for compatibility */
export function agentDefinitionToLegacyManifest(def: AgentDefinition) {
  return {
    agent_id: def.metadata.agent_id,
    cloud_agent_name: def.metadata.cloud_agent_name ?? def.name,
    cloud_agent_id: def.metadata.cloud_agent_id,
    sku: def.metadata.sku ?? def.metadata.agent_id,
    sellable: def.metadata.sellable ?? true,
    model: def.model,
    max_tokens: def.max_tokens ?? 8192,
    output_contract: def.metadata.output_contract,
    description: def.description,
    system_prompt: def.system,
  };
}
