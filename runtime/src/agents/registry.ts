import type { AgentModule } from "./types.js";
import { triageAgent } from "./triage-agent.js";
import { planAgent } from "./plan-agent.js";
import { backendImplementAgent } from "./backend-implement-agent.js";
import { frontendImplementAgent } from "./frontend-implement-agent.js";
import { architectureReviewAgent } from "./architecture-review-agent.js";
import { reviewAgent } from "./review-agent.js";
import { securityAgent } from "./security-agent.js";
import { docsAgent } from "./docs-agent.js";
import { releaseAgent } from "./release-agent.js";
import { qaAgent } from "./qa-agent.js";
import { requirementsAgent } from "./requirements-agent.js";
import { productSpecAgent } from "./product-spec-agent.js";
import { technicalSpecAgent } from "./technical-spec-agent.js";
import { workflowAgent } from "./workflow-agent.js";
import { contractValidatorAgent } from "./contract-validator-agent.js";
import { fullstackImplementAgent } from "./fullstack-implement-agent.js";
import { infraImplementAgent } from "./infra-implement-agent.js";
import { migrationAgent } from "./migration-agent.js";
import { genericAgent } from "./generic-agent.js";
import { handoffSummarizerAgent } from "./handoff-summarizer-agent.js";

const MODULES: Record<string, AgentModule> = {
  "contract-validator-agent": contractValidatorAgent,
  "handoff-summarizer-agent": handoffSummarizerAgent,
  "workflow-agent": workflowAgent,
  "triage-agent": triageAgent,
  "requirements-agent": requirementsAgent,
  "product-spec-agent": productSpecAgent,
  "technical-spec-agent": technicalSpecAgent,
  "plan-agent": planAgent,
  "frontend-implement-agent": frontendImplementAgent,
  "backend-implement-agent": backendImplementAgent,
  "fullstack-implement-agent": fullstackImplementAgent,
  "infra-implement-agent": infraImplementAgent,
  "migration-agent": migrationAgent,
  "architecture-review-agent": architectureReviewAgent,
  "review-agent": reviewAgent,
  "security-agent": securityAgent,
  "docs-agent": docsAgent,
  "release-agent": releaseAgent,
  "qa-agent": qaAgent,
};

export function getAgentModule(agentId: string): AgentModule {
  return MODULES[agentId] ?? genericAgent(agentId);
}

export function listAgentModules(): string[] {
  return Object.keys(MODULES);
}
