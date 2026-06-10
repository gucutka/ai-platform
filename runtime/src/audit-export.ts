import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "./config.js";
import type { AuditEvent } from "./audit.js";

export interface AuditExportResult {
  contract: "AuditExport";
  version: "1.0";
  project_id: string;
  period: string;
  exported_at: string;
  event_count: number;
  issues: number[];
  paths: string[];
  storage: "local" | "s3";
  worm: true;
}

function auditRoot(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "audit");
}

function exportDir(projectDir: string, projectId: string, period: string): string {
  return path.join(projectDir, ".ai-platform", "audit-export", projectId, period);
}

function collectEventFiles(projectDir: string, issueId?: number): string[] {
  const root = auditRoot(projectDir);
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const issueDirs =
    issueId != null
      ? [String(issueId)]
      : fs.readdirSync(root).filter((d) => /^\d+$/.test(d));

  for (const id of issueDirs) {
    const dir = path.join(root, id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".events.jsonl")) {
        files.push(path.join(dir, f));
      }
    }
  }
  return files;
}

function inPeriod(ts: string, month: string): boolean {
  return ts.startsWith(month.slice(0, 7));
}

export function exportAuditTrail(opts: {
  projectDir: string;
  projectId: string;
  month?: string;
  issueId?: number;
}): AuditExportResult {
  const projectDir = opts.projectDir ?? getProjectDir();
  const period = opts.month ?? new Date().toISOString().slice(0, 7);
  const outDir = exportDir(projectDir, opts.projectId, period);
  fs.mkdirSync(outDir, { recursive: true });

  const sourceFiles = collectEventFiles(projectDir, opts.issueId);
  const exportedPaths: string[] = [];
  const issueSet = new Set<number>();
  let eventCount = 0;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `audit-${stamp}.jsonl`);

  const lines: string[] = [];
  for (const src of sourceFiles) {
    const content = fs.readFileSync(src, "utf8").trim();
    if (!content) continue;
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as AuditEvent;
        if (!inPeriod(ev.ts, period)) continue;
        issueSet.add(ev.issue_id);
        lines.push(line);
        eventCount++;
      } catch {
        /* skip */
      }
    }
  }

  if (lines.length) {
    fs.writeFileSync(outFile, lines.join("\n") + "\n", { flag: "wx" });
    exportedPaths.push(outFile);
  }

  const manifestPath = path.join(outDir, "export-manifest.json");
  const result: AuditExportResult = {
    contract: "AuditExport",
    version: "1.0",
    project_id: opts.projectId,
    period,
    exported_at: new Date().toISOString(),
    event_count: eventCount,
    issues: [...issueSet].sort((a, b) => a - b),
    paths: exportedPaths,
    storage: "local",
    worm: true,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(result, null, 2));

  return result;
}

export async function exportAuditTrailToS3(opts: {
  projectDir: string;
  projectId: string;
  month?: string;
  bucket: string;
  prefix?: string;
}): Promise<AuditExportResult> {
  const local = exportAuditTrail({
    projectDir: opts.projectDir,
    projectId: opts.projectId,
    month: opts.month,
  });

  if (!local.paths.length) {
    return { ...local, storage: "s3" };
  }

  const { execSync } = await import("node:child_process");
  const prefix = opts.prefix ?? `audit/${opts.projectId}/${local.period}`;
  for (const filePath of local.paths) {
    const key = `${prefix}/${path.basename(filePath)}`;
    execSync(
      `aws s3 cp "${filePath}" "s3://${opts.bucket}/${key}" --only-show-errors`,
      { stdio: "pipe" }
    );
  }

  return { ...local, storage: "s3" };
}
