import type { AgentModule } from "./types.js";
import { backendImplementAgent } from "./backend-implement-agent.js";
import { frontendImplementAgent } from "./frontend-implement-agent.js";

export const fullstackImplementAgent: AgentModule = {
  agentId: "fullstack-implement-agent",
  outputContract: "CodeChanges",
  skillIds: {
    technology: ["react", "nextjs", "nestjs", "node-typescript"],
  },
  buildOutputInstructions: () =>
    `${backendImplementAgent.buildOutputInstructions()}\n${frontendImplementAgent.buildOutputInstructions()}\nCoordinate FE/BE file boundaries.`,
  validateOutput: backendImplementAgent.validateOutput,
};
