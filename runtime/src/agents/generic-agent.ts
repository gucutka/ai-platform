import type { AgentModule } from "./types.js";

export function genericAgent(agentId: string): AgentModule {
  return {
    agentId,
    outputContract: "Unknown",
    skillIds: {},
    buildOutputInstructions: () =>
      `Emit the required contract for ${agentId} in ai-platform-contract fence.`,
    validateOutput: () => [],
  };
}
