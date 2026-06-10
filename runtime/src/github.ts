import fs from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import type { CodeChanges } from "./types.js";
import { resolveGitHubToken, type GitHubAuthResult } from "./github-auth.js";
import { formatReviewComment } from "./comment-format.js";
import { formatPullRequestBody } from "./pr-body.js";

export class GitHubClient {
  octokit: Octokit;
  owner: string;
  repo: string;
  authMode?: GitHubAuthResult["mode"];

  constructor(token?: string, repository?: string) {
    const t = token ?? process.env.GITHUB_TOKEN;
    if (!t) throw new Error("GITHUB_TOKEN is required");
    const repoFull = repository ?? process.env.GITHUB_REPOSITORY;
    if (!repoFull) throw new Error("GITHUB_REPOSITORY is required");
    const [owner, repo] = repoFull.split("/");
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: t });
  }

  static async create(opts?: {
    token?: string;
    repository?: string;
  }): Promise<GitHubClient> {
    const auth = opts?.token
      ? ({ token: opts.token, mode: "pat" } as GitHubAuthResult)
      : await resolveGitHubToken();
    process.env.GITHUB_TOKEN = auth.token;
    const client = new GitHubClient(auth.token, opts?.repository);
    client.authMode = auth.mode;
    return client;
  }

  async getIssue(number: number) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
    });
    return data;
  }

  async listIssueComments(issueNumber: number): Promise<{ body?: string }[]> {
    const raw = await this.octokit.paginate(this.octokit.issues.listComments, {
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    return raw.map((c) => ({ body: c.body ?? undefined }));
  }

  async addIssueComment(issueNumber: number, body: string) {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  async addLabels(issueNumber: number, labels: string[]) {
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
  }

  async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status !== 404) throw err;
    }
  }

  async createOrUpdateFilesAtomic(
    branch: string,
    files: { path: string; content: string }[],
    message: string
  ): Promise<string> {
    const commitSha = await this.getRefSha(branch);
    const { data: commitData } = await this.octokit.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: commitSha,
    });

    const treeItems: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const file of files) {
      const { data: blob } = await this.octokit.git.createBlob({
        owner: this.owner,
        repo: this.repo,
        content: file.content,
        encoding: "utf-8",
      });
      if (!blob.sha) throw new Error(`failed to create blob for ${file.path}`);
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const { data: tree } = await this.octokit.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: commitData.tree.sha,
      tree: treeItems,
    });

    const { data: newCommit } = await this.octokit.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message,
      tree: tree.sha,
      parents: [commitSha],
    });

    await this.octokit.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return newCommit.sha;
  }

  async getDefaultBranch(): Promise<string> {
    const { data } = await this.octokit.repos.get({ owner: this.owner, repo: this.repo });
    return data.default_branch;
  }

  async getRefSha(ref: string): Promise<string> {
    const { data } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${ref}`,
    });
    return data.object.sha;
  }

  async createBranch(branch: string, fromSha: string) {
    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    });
  }

  async createOrUpdateFiles(
    branch: string,
    files: { path: string; content: string }[],
    message: string
  ) {
    const parentSha = await this.getRefSha(branch);

    for (const file of files) {
      let existingSha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: file.path,
          ref: branch,
        });
        if (!Array.isArray(data) && data.type === "file") {
          existingSha = data.sha;
        }
      } catch {
        existingSha = undefined;
      }

      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path: file.path,
        message: `${message} — ${file.path}`,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch,
        sha: existingSha,
      });
    }

    return parentSha;
  }

  async updatePullRequestBody(prNumber: number, body: string): Promise<void> {
    await this.octokit.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body,
    });
  }

  async createPullRequest(opts: {
    title: string;
    body: string;
    head: string;
    base?: string;
    issueNumber?: number;
  }): Promise<number> {
    const base = opts.base ?? (await this.getDefaultBranch());
    const existing = await this.findOpenPullRequestForHead(opts.head, base);
    if (existing) {
      console.log(`[pr-create] reusing open PR #${existing} for branch ${opts.head}`);
      return existing;
    }

    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: opts.title,
        body: opts.body,
        head: opts.head,
        base,
      });
      if (opts.issueNumber) {
        await this.octokit.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: opts.issueNumber,
          body: `## Pull request opened\n\nPR **#${data.number}** is ready for review.\n\nUse the PR description for summary, changes, and test steps.`,
        });
      }
      return data.number;
    } catch (err) {
      if (this.isDuplicatePullRequestError(err)) {
        const reused = await this.findOpenPullRequestForHead(opts.head, base);
        if (reused) {
          console.log(`[pr-create] reusing existing PR #${reused} for branch ${opts.head}`);
          return reused;
        }
      }
      throw err;
    }
  }

  /** Find open PR where head is owner:branch (GitHub list API format). */
  async findOpenPullRequestForHead(head: string, base?: string): Promise<number | null> {
    const branch = head.includes(":") ? head.split(":").pop()! : head;
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      head: `${this.owner}:${branch}`,
      state: "open",
      ...(base ? { base } : {}),
    });
    return data[0]?.number ?? null;
  }

  isDuplicatePullRequestError(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);
    return status === 422 && msg.includes("A pull request already exists");
  }

  async getPullRequestDiff(prNumber: number): Promise<string> {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return typeof data === "string" ? data : JSON.stringify(data);
  }

  async getPullRequestFiles(prNumber: number) {
    const { data } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  async createPullRequestReview(
    prNumber: number,
    body: string,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES"
  ) {
    await this.octokit.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      body,
      event,
    });
  }

  /** GitHub rejects APPROVE on PRs opened by the same token (typical in Actions). */
  isSelfReviewBlockedError(err: unknown): boolean {
    const status = (err as { status?: number })?.status;
    const msg = err instanceof Error ? err.message : String(err);
    return (
      status === 422 &&
      (msg.includes("approve your own") ||
        msg.includes("Can not approve your own pull request"))
    );
  }

  async mergePullRequest(
    prNumber: number,
    method: "merge" | "squash" | "rebase" = "squash"
  ) {
    await this.octokit.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      merge_method: method,
    });
  }

  async getPullRequest(prNumber: number) {
    const { data } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return data;
  }

  static async applyCodeChanges(
    github: GitHubClient,
    changes: CodeChanges,
    issueTitle: string,
    issueNumber: number,
    opts?: { agentId?: string }
  ): Promise<number> {
    const defaultBranch = await github.getDefaultBranch();
    const existingPr = await github.findOpenPullRequestForHead(
      changes.branch,
      defaultBranch
    );
    if (existingPr) {
      console.log(
        `[pr-create] branch ${changes.branch} already has open PR #${existingPr} — updating files`
      );
    } else {
      const baseSha = await github.getRefSha(defaultBranch);
      try {
        await github.createBranch(changes.branch, baseSha);
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (!msg.includes("Reference already exists")) throw e;
      }
    }

    await github.createOrUpdateFilesAtomic(
      changes.branch,
      changes.files,
      `feat(issue-${issueNumber}): ${issueTitle.slice(0, 72)}`
    );

    const body = formatPullRequestBody({
      issueNumber,
      issueTitle,
      changes,
      agentId: opts?.agentId,
    });

    if (existingPr) {
      await github.updatePullRequestBody(existingPr, body);
      return existingPr;
    }

    return github.createPullRequest({
      title: `[AI] ${issueTitle}`,
      body,
      head: changes.branch,
      base: defaultBranch,
      issueNumber,
    });
  }
}

export function saveArtifact(
  projectDir: string,
  issueNumber: number,
  agentId: string,
  data: Record<string, unknown>
) {
  const dir = path.join(projectDir, ".ai-platform", "runs", String(issueNumber));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${agentId}.json`),
    JSON.stringify(data, null, 2)
  );
}

export function loadArtifact<T = Record<string, unknown>>(
  projectDir: string,
  issueNumber: number,
  agentId: string
): T | null {
  const p = path.join(
    projectDir,
    ".ai-platform",
    "runs",
    String(issueNumber),
    `${agentId}.json`
  );
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export async function applyReviewVerdict(
  github: GitHubClient,
  prNumber: number,
  contract: Record<string, unknown>
): Promise<{ githubEvent: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; selfReviewLimited?: boolean }> {
  const verdict = String(contract.verdict ?? "FAIL").toUpperCase();
  const body = formatReviewComment("Code review", contract, "review-agent");

  const event =
    verdict === "PASS" ? "APPROVE" : verdict === "FAIL" ? "REQUEST_CHANGES" : "COMMENT";

  try {
    await github.createPullRequestReview(prNumber, body, event);
    return { githubEvent: event };
  } catch (err) {
    if (event === "APPROVE" && github.isSelfReviewBlockedError(err)) {
      const note =
        "\n\n> **Note:** GitHub does not allow Actions to APPROVE its own PR. Verdict **PASS** is recorded via issue/PR labels (`agent:approved`); automerge uses manifest gates.";
      await github.createPullRequestReview(prNumber, body + note, "COMMENT");
      return { githubEvent: "COMMENT", selfReviewLimited: true };
    }
    throw err;
  }
}
