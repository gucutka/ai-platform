import { GitHubClient } from "./github.js";
import { applyProjectFieldUpdates } from "./github-project.js";
import {
  formatProjectSyncComment,
  loadProjectSyncConfig,
  mapLabelsToProjectFields,
  saveProjectSyncResult,
  type ProjectSyncResult,
} from "./project-sync.js";

export async function runProjectSync(opts: {
  projectDir: string;
  issueNumber: number;
  github?: GitHubClient;
  comment?: boolean;
}): Promise<ProjectSyncResult> {
  const github = opts.github ?? new GitHubClient();
  const issue = await github.getIssue(opts.issueNumber);
  const labels = (issue.labels ?? [])
    .map((l) => (typeof l === "string" ? l : l.name))
    .filter(Boolean) as string[];

  const { updates, status, blocked } = mapLabelsToProjectFields(labels);
  const config = loadProjectSyncConfig(opts.projectDir);

  let remoteApplied = false;
  let dryRunReason: string | undefined;
  let projectItemId: string | undefined;

  if (!config) {
    dryRunReason = "no .ai-platform/project-sync.yaml";
  } else if (config.enabled === false) {
    dryRunReason = "project-sync disabled in config";
  } else {
    try {
      const remote = await applyProjectFieldUpdates({
        github,
        config,
        issueNumber: opts.issueNumber,
        updates,
      });
      remoteApplied = remote.applied > 0;
      projectItemId = remote.projectItemId;
      if (remote.applied === 0) {
        dryRunReason = "no matching project fields (check field names/options)";
      }
    } catch (err) {
      dryRunReason = err instanceof Error ? err.message : String(err);
    }
  }

  const result: ProjectSyncResult = {
    contract: "ProjectSyncResult",
    version: "1.0",
    issue_id: opts.issueNumber,
    synced_at: new Date().toISOString(),
    labels,
    field_updates: updates,
    status,
    blocked,
    project_item_id: projectItemId,
    remote_applied: remoteApplied,
    dry_run_reason: dryRunReason,
  };

  saveProjectSyncResult(opts.projectDir, opts.issueNumber, result);

  if (opts.comment !== false) {
    await github.addIssueComment(opts.issueNumber, formatProjectSyncComment(result));
  }

  return result;
}

export function extractIssueFromPrBody(body: string): number | null {
  const patterns = [
    /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i,
    /(?:ref(?:s)?|issue)\s+#(\d+)/i,
    /#(\d+)/,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export async function runQaStatusSync(opts: {
  projectDir: string;
  prNumber: number;
  conclusion: string;
  github?: GitHubClient;
}): Promise<{ issueNumber: number | null; label: string }> {
  const github = opts.github ?? new GitHubClient();
  const { data: pr } = await github.octokit.pulls.get({
    owner: github.owner,
    repo: github.repo,
    pull_number: opts.prNumber,
  });

  const issueNumber = extractIssueFromPrBody(pr.body ?? "");
  if (!issueNumber) {
    return { issueNumber: null, label: "" };
  }

  const passed = opts.conclusion === "success";
  const label = passed ? "ci:passed" : "ci:failed";

  await github.removeLabel(issueNumber, "ci:passed");
  await github.removeLabel(issueNumber, "ci:failed");
  await github.addLabels(issueNumber, [label]);

  await runProjectSync({
    projectDir: opts.projectDir,
    issueNumber,
    github,
    comment: false,
  });

  await github.addIssueComment(
    issueNumber,
    [
      "<!-- ai-platform-qa-status -->",
      "## CI status synced",
      `PR **#${opts.prNumber}** · workflow **Test** → \`${opts.conclusion}\``,
      "",
      `Label applied: \`${label}\`. Project board fields updated from issue labels.`,
    ].join("\n")
  );

  return { issueNumber, label };
}

export async function runIssueRoute(opts: {
  projectDir: string;
  issueNumber: number;
  dispatcher: { dispatchAgent: (issue: number, agentId: string) => Promise<unknown>; github: GitHubClient };
}): Promise<{ sync: ProjectSyncResult; triage: unknown }> {
  const sync = await runProjectSync({
    projectDir: opts.projectDir,
    issueNumber: opts.issueNumber,
    github: opts.dispatcher.github,
    comment: true,
  });

  const triage = await opts.dispatcher.dispatchAgent(opts.issueNumber, "triage-agent");
  return { sync, triage };
}
