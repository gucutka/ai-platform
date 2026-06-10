/**
 * Claude API integration layer (Cloud runtime — Messages API).
 * Cursor IDE is not used at runtime.
 */
import Anthropic from "@anthropic-ai/sdk";
import { extractContract, loadContractToolSchema } from "./contracts.js";

const CONTRACT_TOOL = "emit_ai_platform_contract";

export interface ClaudeInvokeOptions {
  model: string;
  maxTokens: number;
  system: string;
  userMessage: string;
  maxRetries?: number;
  contractName?: string;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is required");
    this.client = new Anthropic({ apiKey: key, maxRetries: 0 });
  }

  async invoke(opts: ClaudeInvokeOptions): Promise<{
    text: string;
    contract: Record<string, unknown> | null;
    usage: { input: number; output: number };
  }> {
    const maxRetries = opts.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const useTool = Boolean(opts.contractName);
        const response = await this.client.messages.create({
          model: opts.model,
          max_tokens: opts.maxTokens,
          system: opts.system,
          messages: [{ role: "user", content: opts.userMessage }],
          ...(useTool
            ? {
                tools: [
                  {
                    name: CONTRACT_TOOL,
                    description: `Emit ${opts.contractName}@1.0 as structured JSON`,
                    input_schema: loadContractToolSchema(
                      opts.contractName!
                    ) as Anthropic.Tool["input_schema"],
                  },
                ],
                tool_choice: { type: "tool", name: CONTRACT_TOOL },
              }
            : {}),
        });

        const toolBlock = response.content.find((b) => b.type === "tool_use");
        if (toolBlock?.type === "tool_use") {
          const contract = toolBlock.input as Record<string, unknown>;
          return {
            text: JSON.stringify(contract, null, 2),
            contract,
            usage: {
              input: response.usage.input_tokens,
              output: response.usage.output_tokens,
            },
          };
        }

        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b.type === "text" ? b.text : ""))
          .join("\n");

        return {
          text,
          contract: extractContract(text, opts.contractName),
          usage: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        };
      } catch (err) {
        lastError = err as Error;
        const status = (err as { status?: number }).status;
        if (status === 429 || status === 529) {
          const delay = Math.min(60000, 2000 * 2 ** attempt);
          await sleep(delay);
          continue;
        }
        if (attempt < maxRetries - 1) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastError ?? new Error("Claude invoke failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
