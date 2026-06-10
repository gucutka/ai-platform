import fs from "node:fs";
import path from "node:path";
import { formatContractDetails, humanAgentName, machineMarker } from "./comment-format.js";
import { getProjectDir } from "./config.js";
import type { PipelineCheckpoint } from "./checkpoint.js";

export interface DlqEntry {
  contract: "DlqEntry";
  version: "1.0";
  issue_id: number;
  project_id: string;
  failed_step: string;
  error: string;
  run_id?: string;
  checkpoint?: PipelineCheckpoint;
  enqueued_at: string;
  status: "open" | "resolved";
  resolved_at?: string;
  resume_from?: string;
  attempts: number;
}

function dlqDir(projectDir: string): string {
  return path.join(projectDir ?? getProjectDir(), ".ai-platform", "dlq");
}

function dlqFile(projectDir: string, issueId: number): string {
  return path.join(dlqDir(projectDir), `${issueId}.json`);
}

export function enqueueDlqEntry(opts: {
  projectDir: string;
  projectId: string;
  issueId: number;
  failedStep: string;
  error: string;
  runId?: string;
  checkpoint?: PipelineCheckpoint;
}): DlqEntry {
  const dir = dlqDir(opts.projectDir);
  fs.mkdirSync(dir, { recursive: true });

  const existing = loadDlqEntry(opts.projectDir, opts.issueId);
  const entry: DlqEntry = {
    contract: "DlqEntry",
    version: "1.0",
    issue_id: opts.issueId,
    project_id: opts.projectId,
    failed_step: opts.failedStep,
    error: opts.error,
    run_id: opts.runId,
    checkpoint: opts.checkpoint,
    enqueued_at: new Date().toISOString(),
    status: "open",
    attempts: (existing?.attempts ?? 0) + 1,
  };

  fs.writeFileSync(dlqFile(opts.projectDir, opts.issueId), JSON.stringify(entry, null, 2));
  fs.writeFileSync(
    path.join(dir, "latest.json"),
    JSON.stringify({ issue_id: opts.issueId, enqueued_at: entry.enqueued_at }, null, 2)
  );
  return entry;
}

export function loadDlqEntry(projectDir: string, issueId: number): DlqEntry | null {
  const file = dlqFile(projectDir, issueId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as DlqEntry;
}

export function listDlqEntries(projectDir: string): DlqEntry[] {
  const dir = dlqDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as DlqEntry)
    .filter((e) => e.status === "open");
}

export function resolveDlqEntry(
  projectDir: string,
  issueId: number,
  resumeFrom: string
): DlqEntry | null {
  const entry = loadDlqEntry(projectDir, issueId);
  if (!entry || entry.status !== "open") return null;
  entry.status = "resolved";
  entry.resolved_at = new Date().toISOString();
  entry.resume_from = resumeFrom;
  fs.writeFileSync(dlqFile(projectDir, issueId), JSON.stringify(entry, null, 2));
  return entry;
}

export function formatDlqComment(entry: DlqEntry): string {
  const stepLabel = entry.failed_step.endsWith("-agent")
    ? humanAgentName(entry.failed_step)
    : entry.failed_step;
  return [
    machineMarker("dlq"),
    "## Pipeline paused — recovery required",
    `**Issue:** #${entry.issue_id} · **Failed at:** ${stepLabel} · **Attempts:** ${entry.attempts}`,
    "",
    "### What happened",
    "",
    entry.error.slice(0, 800),
    "",
    "### Resume",
    "",
    "```bash",
    `node dist/cli.js resume --issue ${entry.issue_id} --from ${entry.failed_step}`,
    "```",
    "",
    "Or run the **Pipeline Resume** workflow in GitHub Actions.",
    formatContractDetails("DlqEntry@1.0", entry as unknown as Record<string, unknown>),
  ].join("\n");
}

export function suggestResumeAgent(entry: DlqEntry): string {
  if (entry.failed_step.endsWith("-agent")) return entry.failed_step;
  if (entry.checkpoint?.failed_step?.endsWith("-agent")) {
    return entry.checkpoint.failed_step;
  }
  return entry.checkpoint?.last_step ?? "plan-agent";
}
