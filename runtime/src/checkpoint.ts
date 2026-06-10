import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "./config.js";
import type { WorkflowDecisionRecord } from "./workflow-router.js";

export interface PipelineCheckpoint {
  issue_id: number;
  workflow_decision?: WorkflowDecisionRecord;
  completed_steps: string[];
  last_step?: string;
  pr_number?: number;
  architect_gate?: string;
  arch_review?: string;
  failed_step?: string;
  error?: string;
  updated_at: string;
}

function checkpointDir(projectDir: string, issueId: number): string {
  return path.join(projectDir ?? getProjectDir(), ".ai-platform", "checkpoints", String(issueId));
}

export function loadCheckpoint(
  projectDir: string,
  issueId: number
): PipelineCheckpoint | null {
  const file = path.join(checkpointDir(projectDir, issueId), "state.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PipelineCheckpoint;
}

export function saveCheckpoint(
  projectDir: string,
  state: PipelineCheckpoint
): void {
  const dir = checkpointDir(projectDir, state.issue_id);
  fs.mkdirSync(dir, { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
}

export function markStepComplete(
  projectDir: string,
  issueId: number,
  stepId: string,
  extra?: Partial<PipelineCheckpoint>
): PipelineCheckpoint {
  const current =
    loadCheckpoint(projectDir, issueId) ??
    ({
      issue_id: issueId,
      completed_steps: [],
      updated_at: new Date().toISOString(),
    } as PipelineCheckpoint);

  if (!current.completed_steps.includes(stepId)) {
    current.completed_steps.push(stepId);
  }
  current.last_step = stepId;
  Object.assign(current, extra);
  saveCheckpoint(projectDir, current);
  return current;
}

export function isStepCompleted(
  checkpoint: PipelineCheckpoint | null,
  stepId: string
): boolean {
  return checkpoint?.completed_steps.includes(stepId) ?? false;
}

export function recordPipelineFailure(
  projectDir: string,
  issueId: number,
  failedStep: string,
  error: string,
  extra?: Partial<PipelineCheckpoint>
): PipelineCheckpoint {
  const current =
    loadCheckpoint(projectDir, issueId) ??
    ({
      issue_id: issueId,
      completed_steps: [],
      updated_at: new Date().toISOString(),
    } as PipelineCheckpoint);

  current.failed_step = failedStep;
  current.error = error;
  Object.assign(current, extra);
  saveCheckpoint(projectDir, current);
  return current;
}

export function resolveStartIndex(
  steps: { id: string }[],
  fromAgent?: string
): number {
  if (!fromAgent) return 0;
  const idx = steps.findIndex(
    (s) => s.id === fromAgent || ("agentId" in s && (s as { agentId?: string }).agentId === fromAgent)
  );
  return idx >= 0 ? idx : 0;
}
