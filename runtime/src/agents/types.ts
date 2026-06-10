export interface AgentModule {
  agentId: string;
  outputContract: string;
  skillIds: { core?: string[]; sdlc?: string[]; technology?: string[] };
  buildOutputInstructions(): string;
  normalizeOutput?(data: Record<string, unknown>): Record<string, unknown>;
  validateOutput?(data: Record<string, unknown>): string[];
}
