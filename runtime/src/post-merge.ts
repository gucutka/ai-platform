import fs from "node:fs";
import path from "node:path";
import { formatContractDetails, formatKeyValueTable, machineMarker } from "./comment-format.js";
import { saveArtifact, loadArtifact } from "./github.js";
import { formatContractComment } from "./contracts.js";
import { getAgentModule } from "./agents/index.js";
import type { Dispatcher } from "./dispatcher.js";

export interface MergeRecord {
  contract: "MergeRecord";
  version: "1.0";
  issue_id: number;
  pr_number: number;
  merged_by: string;
  merge_sha?: string;
  merged_at?: string;
  merge_method?: string;
}

export interface DocumentationResult {
  contract: "DocumentationResult";
  version: "1.0";
  issue_id: number;
  docs_updated: string[];
  status: "draft" | "applied";
  summary?: string;
  changelog_entry?: string;
}

export interface ReleaseResult {
  contract: "ReleaseResult";
  version: string;
  issue_id: number;
  tag: string;
  status: "draft" | "approved" | "published";
  release_notes?: string;
}

export function buildMergeRecord(opts: {
  issueId: number;
  prNumber: number;
  mergedBy?: string;
  mergeSha?: string;
  mergeMethod?: string;
}): MergeRecord {
  return {
    contract: "MergeRecord",
    version: "1.0",
    issue_id: opts.issueId,
    pr_number: opts.prNumber,
    merged_by: opts.mergedBy ?? "github-actions",
    merge_sha: opts.mergeSha,
    merged_at: new Date().toISOString(),
    merge_method: opts.mergeMethod,
  };
}

export function formatMergeRecordComment(record: MergeRecord): string {
  return [
    machineMarker("merge-record"),
    "## Merge recorded",
    `PR **#${record.pr_number}** was merged. Post-merge SDLC continues with documentation and release steps.`,
    formatKeyValueTable([
      ["Merge method", String(record.merge_method ?? "—")],
      ["Merged by", String(record.merged_by ?? "—")],
      ["SHA", record.merge_sha ? `\`${record.merge_sha.slice(0, 8)}\`` : "—"],
    ]),
    formatContractDetails("MergeRecord@1.0", record as unknown as Record<string, unknown>),
  ].join("\n\n");
}

export function formatReleaseDraftComment(result: ReleaseResult): string {
  return [
    machineMarker("release-draft"),
    `## Release draft — \`${result.tag}\``,
    formatKeyValueTable([
      ["Status", String(result.status)],
      ["Version", String(result.version)],
    ]),
    "### Release notes",
    "",
    result.release_notes ?? "_Pending approval._",
    "",
    "### Approve",
    "",
    "Run the **Release Approve** workflow or:",
    "",
    "```bash",
    `node dist/cli.js release-approve --issue ${result.issue_id} --project-dir .`,
    "```",
    formatContractDetails("ReleaseResult@1.0", result as unknown as Record<string, unknown>),
  ].join("\n");
}

function readPackageVersion(projectDir: string): string {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return "0.1.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export function bumpPatchVersion(version: string): string {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    return "0.1.1";
  }
  parts[2]! += 1;
  return parts.join(".");
}

export function applyDocumentationResult(
  projectDir: string,
  doc: DocumentationResult
): DocumentationResult {
  const updated = new Set<string>(doc.docs_updated ?? []);
  const entry =
    doc.changelog_entry ??
    doc.summary ??
    `Issue #${doc.issue_id}: documentation update`;

  const changelogPath = path.join(projectDir, "CHANGELOG.md");
  const date = new Date().toISOString().slice(0, 10);
  const block = `\n## [Unreleased] — ${date}\n\n### Added\n- ${entry}\n`;

  if (fs.existsSync(changelogPath)) {
    const raw = fs.readFileSync(changelogPath, "utf8");
    if (!raw.includes(entry.slice(0, Math.min(40, entry.length)))) {
      fs.writeFileSync(changelogPath, raw.trimEnd() + block + "\n");
    }
  } else {
    fs.writeFileSync(
      changelogPath,
      `# Changelog\n\nAll notable changes are documented here (Keep a Changelog).\n${block}\n`
    );
  }
  updated.add("CHANGELOG.md");

  const readmePath = path.join(projectDir, "README.md");
  if (fs.existsSync(readmePath) && doc.summary) {
    const raw = fs.readFileSync(readmePath, "utf8");
    const marker = "<!-- ai-platform-release-notes -->";
    const section = `\n${marker}\n\n### Recent\n- ${doc.summary} (Issue #${doc.issue_id})\n`;
    if (!raw.includes(marker)) {
      fs.writeFileSync(readmePath, raw.trimEnd() + section + "\n");
      updated.add("README.md");
    }
  }

  return {
    ...doc,
    docs_updated: [...updated],
    status: "applied",
  };
}

export function buildFallbackReleaseResult(
  projectDir: string,
  issueId: number,
  doc: DocumentationResult
): ReleaseResult {
  const current = readPackageVersion(projectDir);
  const next = bumpPatchVersion(current);
  return {
    contract: "ReleaseResult",
    version: next,
    issue_id: issueId,
    tag: `v${next}`,
    status: "draft",
    release_notes: doc.changelog_entry ?? doc.summary ?? `Release for issue #${issueId}`,
  };
}

export async function runPostMergeSdlc(
  dispatcher: Dispatcher,
  opts: {
    issueNumber: number;
    prNumber: number;
    mergeSha?: string;
    mergedBy?: string;
    mergeMethod?: string;
  }
): Promise<{
  mergeRecord: MergeRecord;
  documentation: DocumentationResult;
  release: ReleaseResult;
}> {
  const { issueNumber, prNumber } = opts;
  const projectDir = dispatcher.projectDir;
  const github = dispatcher.github;

  const mergeRecord = buildMergeRecord({
    issueId: issueNumber,
    prNumber,
    mergedBy: opts.mergedBy,
    mergeSha: opts.mergeSha,
    mergeMethod: opts.mergeMethod,
  });
  saveArtifact(projectDir, issueNumber, "merge-record", mergeRecord as unknown as Record<string, unknown>);
  await github.addIssueComment(issueNumber, formatMergeRecordComment(mergeRecord));
  dispatcher.auditSession?.recordMergeCompleted(mergeRecord);

  const docsResult = await dispatcher.dispatchAgent(issueNumber, "docs-agent", {
    prNumber,
  });
  let documentation = getAgentModule("docs-agent").normalizeOutput
    ? (getAgentModule("docs-agent").normalizeOutput!(docsResult.contract) as unknown as DocumentationResult)
    : (docsResult.contract as unknown as DocumentationResult);

  documentation = applyDocumentationResult(projectDir, documentation);
  saveArtifact(
    projectDir,
    issueNumber,
    "docs-agent",
    documentation as unknown as Record<string, unknown>
  );
  await github.addIssueComment(
    issueNumber,
    formatContractComment("docs-agent", documentation as unknown as Record<string, unknown>)
  );
  dispatcher.auditSession?.recordPostMergeAgent("docs-agent", documentation as unknown as Record<string, unknown>);

  const releaseDispatch = await dispatcher.dispatchAgent(issueNumber, "release-agent", {
    prNumber,
  });
  let release = getAgentModule("release-agent").normalizeOutput
    ? (getAgentModule("release-agent").normalizeOutput!(releaseDispatch.contract) as unknown as ReleaseResult)
    : (releaseDispatch.contract as unknown as ReleaseResult);

  if (!release.tag || !release.version) {
    release = buildFallbackReleaseResult(projectDir, issueNumber, documentation);
  }
  if (release.status !== "draft" && release.status !== "approved" && release.status !== "published") {
    release.status = "draft";
  }
  saveArtifact(projectDir, issueNumber, "release-agent", release as unknown as Record<string, unknown>);
  await github.addIssueComment(issueNumber, formatReleaseDraftComment(release));
  dispatcher.auditSession?.recordPostMergeAgent("release-agent", release as unknown as Record<string, unknown>);

  return { mergeRecord, documentation, release };
}

export function approveReleaseResult(
  projectDir: string,
  issueNumber: number,
  approve: boolean
): ReleaseResult | null {
  const raw = loadArtifact<ReleaseResult>(projectDir, issueNumber, "release-agent");
  if (!raw?.tag) return null;
  const updated: ReleaseResult = {
    ...raw,
    status: approve ? "approved" : "draft",
  };
  saveArtifact(projectDir, issueNumber, "release-agent", updated as unknown as Record<string, unknown>);
  return updated;
}

export function markReleasePublished(
  projectDir: string,
  issueNumber: number
): ReleaseResult | null {
  const raw = loadArtifact<ReleaseResult>(projectDir, issueNumber, "release-agent");
  if (!raw) return null;
  const updated: ReleaseResult = { ...raw, status: "published" };
  saveArtifact(projectDir, issueNumber, "release-agent", updated as unknown as Record<string, unknown>);
  return updated;
}
