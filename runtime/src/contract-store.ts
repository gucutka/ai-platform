import fs from "node:fs";
import path from "node:path";
import { getRunsDir } from "./config.js";
import { loadArtifact, saveArtifact } from "./github.js";
import { parseContractsFromComments } from "./contracts.js";
import { getAgentModule } from "./agents/index.js";
import type { GitHubClient } from "./github.js";

/** Agent id → primary output contract name */
const AGENT_OUTPUT: Record<string, string> = {
  "triage-agent": "TriageResult",
  "workflow-agent": "WorkflowDecision",
  "requirements-agent": "BusinessRequirements",
  "product-spec-agent": "ProductSpec",
  "technical-spec-agent": "TechnicalDesign",
  "plan-agent": "ImplementationPlan",
  "architecture-review-agent": "ArchitectureReviewReport",
  "review-agent": "ReviewReport",
  "security-agent": "SecurityReport",
  "docs-agent": "DocumentationResult",
  "release-agent": "ReleaseResult",
  "qa-agent": "VerificationResult",
  "migration-agent": "MigrationPlan",
};

const CONTRACT_TO_AGENT: Record<string, string> = Object.fromEntries(
  Object.entries(AGENT_OUTPUT).map(([agent, contract]) => [contract, agent])
);

export function outputContractForAgent(agentId: string): string | undefined {
  try {
    return getAgentModule(agentId).outputContract;
  } catch {
    return AGENT_OUTPUT[agentId];
  }
}

/** Load contract from local runs dir, agent artifact, or issue comments. */
export function resolveContract(
  projectDir: string,
  issueNumber: number,
  contractName: string,
  issueComments?: string
): Record<string, unknown> {
  const fromDir = loadFromRunsDir(projectDir, issueNumber, contractName);
  if (fromDir?.contract) return fromDir;

  const agentId = CONTRACT_TO_AGENT[contractName];
  if (agentId) {
    const art = loadArtifact(projectDir, issueNumber, agentId);
    if (art && (art as Record<string, unknown>).contract === contractName) {
      return art as Record<string, unknown>;
    }
  }

  if (issueComments) {
    for (const c of parseContractsFromComments(issueComments)) {
      if (c.contract === contractName) return c;
    }
  }

  return {};
}

function loadFromRunsDir(
  projectDir: string,
  issueNumber: number,
  contractName: string
): Record<string, unknown> | null {
  const dir = path.join(getRunsDir(projectDir), String(issueNumber));
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(
      fs.readFileSync(path.join(dir, f), "utf8")
    ) as Record<string, unknown>;
    if (data.contract === contractName) return data;
  }
  return null;
}

/** Persist contracts parsed from issue comments into runs/{issue}/{agent}.json */
export function hydrateContractsFromComments(
  projectDir: string,
  issueNumber: number,
  commentsBody: string
): number {
  let n = 0;
  for (const c of parseContractsFromComments(commentsBody)) {
    const name = String(c.contract ?? "");
    const agentId = CONTRACT_TO_AGENT[name];
    if (!agentId) continue;
    const existing = loadArtifact(projectDir, issueNumber, agentId);
    if (existing?.contract) continue;
    saveArtifact(projectDir, issueNumber, agentId, c);
    n++;
  }
  return n;
}

export async function fetchIssueCommentsBody(
  github: GitHubClient,
  issueNumber: number
): Promise<string> {
  const comments = await github.listIssueComments(issueNumber);
  return comments.map((c) => c.body ?? "").join("\n\n");
}

export function agentStepHasOutput(
  projectDir: string,
  issueNumber: number,
  agentId: string,
  issueComments?: string
): boolean {
  const contractName = outputContractForAgent(agentId);
  if (!contractName) return true;
  const data = resolveContract(projectDir, issueNumber, contractName, issueComments);
  return !!data.contract;
}
