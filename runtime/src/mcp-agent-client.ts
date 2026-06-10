import Anthropic from "@anthropic-ai/sdk";
import { loadContractToolSchema } from "./contracts.js";
import { extractContract } from "./contracts.js";
import type { AgentDefinition } from "./agent-definition.js";
import { resolveMcpServers } from "./agent-definition.js";
import { CHANNEL_TURN_INSTRUCTIONS } from "./channels/channel-turn.js";

const MCP_BETA = "mcp-client-2025-11-20";
const PLATFORM_TURN_TOOL = "emit_channel_turn";

const CHANNEL_TURN_SCHEMA = {
  type: "object" as const,
  properties: {
    reply: { type: "string", description: "Slack mrkdwn shown to the user (not GitHub markdown)" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
    phase_complete: { type: "boolean" },
  },
  required: ["reply"],
};

export interface McpAgentInvokeResult {
  text: string;
  contract: Record<string, unknown> | null;
  channelTurn: Record<string, unknown> | null;
  usage: { input: number; output: number };
  usedMcpSlack: boolean;
}

function buildApiTools(
  def: AgentDefinition,
  activeMcpServerNames: Set<string>
): Anthropic.Beta.Messages.BetaToolUnion[] {
  const tools: Anthropic.Beta.Messages.BetaToolUnion[] = [];

  for (const t of def.tools ?? []) {
    if (t.type === "mcp_toolset") {
      if (!activeMcpServerNames.has(t.mcp_server_name)) continue;
      tools.push({
        type: "mcp_toolset",
        mcp_server_name: t.mcp_server_name,
        default_config: { enabled: true },
      });
    } else if (t.type === "contract_toolset") {
      tools.push({
        name: "emit_ai_platform_contract",
        description: `Emit ${t.contract} as structured JSON`,
        input_schema: loadContractToolSchema(
          t.contract.replace(/@\d+\.\d+$/, "")
        ) as Anthropic.Tool.InputSchema,
      } as Anthropic.Beta.Messages.BetaTool);
    } else if (t.type === "platform_toolset") {
      tools.push({
        name: PLATFORM_TURN_TOOL,
        description:
          "Emit conversational reply and platform actions (write_knowledge, write_adr, create_github_issue, etc.)",
        input_schema: CHANNEL_TURN_SCHEMA,
      } as Anthropic.Beta.Messages.BetaTool);
    }
  }

  return tools;
}

export class McpAgentClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required");
    this.client = new Anthropic({ apiKey: key, maxRetries: 0 });
  }

  async invoke(opts: {
    definition: AgentDefinition;
    userMessage: string;
    systemAppend?: string;
  }): Promise<McpAgentInvokeResult> {
    const def = opts.definition;
    const mcpServers = resolveMcpServers(def.mcp_servers);
    const activeMcpNames = new Set(mcpServers.map((s) => s.name));
    const tools = buildApiTools(def, activeMcpNames);

    const wantsSlackMcp =
      def.mcp_servers?.some((s) => s.name === "slack") &&
      def.tools?.some((t) => t.type === "mcp_toolset" && t.mcp_server_name === "slack");
    const slackMcpActive = activeMcpNames.has("slack");

    let systemAppend = opts.systemAppend ?? "";
    if (wantsSlackMcp && !slackMcpActive) {
      systemAppend = [
        systemAppend,
        CHANNEL_TURN_INSTRUCTIONS,
        "The platform delivers your `reply` to the user (Slack or local CLI). " +
          "Use the **emit_channel_turn** tool — do not attempt Slack MCP.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const system = systemAppend ?
      `${def.system}\n\n${systemAppend}`
    : def.system;

    const usedMcpSlack =
      slackMcpActive &&
      tools.some((t) => "mcp_server_name" in t && t.mcp_server_name === "slack");

    const base = {
      model: def.model,
      max_tokens: def.max_tokens ?? 8192,
      system,
      messages: [{ role: "user" as const, content: opts.userMessage }],
    };

    // Beta MCP endpoint requires anthropic-beta header; empty betas: [] breaks the API.
    const response =
      mcpServers.length > 0
        ? await this.client.beta.messages.create({
            ...base,
            mcp_servers: mcpServers,
            ...(tools.length ? { tools } : {}),
            betas: [MCP_BETA],
          })
        : await this.client.messages.create({
            ...base,
            ...(tools.length
              ? {
                  tools: tools.filter(
                    (t): t is Anthropic.Tool =>
                      "name" in t && !("mcp_server_name" in t)
                  ),
                }
              : {}),
          });

    let text = "";
    let contract: Record<string, unknown> | null = null;
    let channelTurn: Record<string, unknown> | null = null;

    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        if (block.name === PLATFORM_TURN_TOOL) {
          channelTurn = block.input as Record<string, unknown>;
        } else if (block.name === "emit_ai_platform_contract") {
          contract = block.input as Record<string, unknown>;
          text = JSON.stringify(contract, null, 2);
        }
      }
    }

    if (!contract && def.metadata.output_contract) {
      contract = extractContract(text, def.metadata.output_contract.replace(/@\d+\.\d+$/, ""));
    }

    if (!channelTurn && text) {
      const fence = text.match(/```ai-platform-channel-turn\s*([\s\S]*?)```/i);
      if (fence) {
        try {
          channelTurn = JSON.parse(fence[1].trim()) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }
    }

    return {
      text: channelTurn?.reply ? String(channelTurn.reply) : text,
      contract,
      channelTurn,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      usedMcpSlack,
    };
  }
}

export function getMcpAgentClient(): McpAgentClient {
  return new McpAgentClient();
}
