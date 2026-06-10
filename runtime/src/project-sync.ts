import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { formatContractDetails, machineMarker } from "./comment-format.js";

export interface ProjectSyncConfig {
  version?: string;
  enabled?: boolean;
  owner: string;
  owner_type?: "organization" | "user";
  project_number?: number;
  project_id?: string;
  fields?: {
    agent_route?: { field_name?: string; field_id?: string };
    risk?: { field_name?: string; field_id?: string };
    status?: { field_name?: string; field_id?: string };
    blocked?: { field_name?: string; field_id?: string };
  };
}

export interface ProjectFieldUpdate {
  field: string;
  value: string;
  source_label?: string;
}

export interface ProjectSyncResult {
  contract: "ProjectSyncResult";
  version: "1.0";
  issue_id: number;
  synced_at: string;
  labels: string[];
  field_updates: ProjectFieldUpdate[];
  status?: string;
  blocked?: boolean;
  project_item_id?: string;
  remote_applied: boolean;
  dry_run_reason?: string;
}

const STATUS_BY_LABEL: Record<string, string> = {
  "agent-route:pending": "Backlog",
  "agent-route:planned": "Implementation",
  "agent-route:ready-to-merge": "Ready For Merge",
  "agent-route:merged": "Merged",
  "agent-route:blocked": "Review",
  "arch-review:pending": "Review",
  "arch-review:passed": "Review",
  "human-review:required": "Review",
  "security-scan:required": "Verification",
  "security-scan:passed": "Ready For Merge",
};

export function projectSyncConfigPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "project-sync.yaml");
}

export function loadProjectSyncConfig(projectDir: string): ProjectSyncConfig | null {
  const p = projectSyncConfigPath(projectDir);
  if (!fs.existsSync(p)) return null;
  return YAML.parse(fs.readFileSync(p, "utf8")) as ProjectSyncConfig;
}

export function mapLabelsToProjectFields(labels: string[]): {
  updates: ProjectFieldUpdate[];
  status?: string;
  blocked: boolean;
} {
  const updates: ProjectFieldUpdate[] = [];
  let status: string | undefined;
  let blocked = false;

  for (const label of labels) {
    if (label.startsWith("agent-route:")) {
      const value = label.slice("agent-route:".length);
      updates.push({ field: "Agent Route", value, source_label: label });
      status = STATUS_BY_LABEL[label] ?? status;
      if (label === "agent-route:blocked") blocked = true;
    }
    if (label.startsWith("risk:")) {
      const value = label.slice("risk:".length);
      updates.push({ field: "Risk", value, source_label: label });
    }
    if (label.startsWith("arch-review:")) {
      status = STATUS_BY_LABEL[label] ?? status;
      if (label === "arch-review:failed") blocked = true;
    }
    if (label === "agent:review-failed" || label === "security-scan:failed") {
      blocked = true;
    }
    if (label === "ci:failed") {
      blocked = true;
      status = "Verification";
    }
    if (label === "ci:passed") {
      status = status ?? "Verification";
    }
    if (STATUS_BY_LABEL[label] && !status) {
      status = STATUS_BY_LABEL[label];
    }
  }

  if (blocked) {
    updates.push({ field: "Blocked", value: "true", source_label: "blocked" });
  } else {
    updates.push({ field: "Blocked", value: "false" });
  }
  if (status) {
    updates.push({ field: "Status", value: status });
  }

  return { updates, status, blocked };
}

export function saveProjectSyncResult(
  projectDir: string,
  issueNumber: number,
  result: ProjectSyncResult
): string {
  const dir = path.join(projectDir, ".ai-platform", "project-sync");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${issueNumber}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(result, null, 2));
  return out;
}

export function formatProjectSyncComment(result: ProjectSyncResult): string {
  const rows = result.field_updates
    .map((u) => `| ${u.field} | ${u.value} | ${u.source_label ?? "—"} |`)
    .join("\n");
  const status = result.remote_applied
    ? "GitHub Project board updated from issue labels."
    : `Local sync only${result.dry_run_reason ? ` — ${result.dry_run_reason}` : "."}`;

  return [
    machineMarker("project-sync"),
    `## Project board sync — issue #${result.issue_id}`,
    status,
    "",
    "| Field | Value | Source |",
    "|-------|-------|--------|",
    rows || "| — | — | — |",
    formatContractDetails("ProjectSyncResult@1.0", result as unknown as Record<string, unknown>),
  ].join("\n");
}
