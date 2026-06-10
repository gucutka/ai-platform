import { formatKeyValueTable, humanAgentName, machineMarker } from "./comment-format.js";
import type { Manifest } from "./types.js";

export type ImplementRuntime = "cloud-agent" | "claude-code";

export class ClaudeCodeSessionRequiredError extends Error {
  readonly issueId: number;
  readonly implementAgent: string;

  constructor(issueId: number, implementAgent: string) {
    super(`Claude Code session required for issue #${issueId} (${implementAgent})`);
    this.name = "ClaudeCodeSessionRequiredError";
    this.issueId = issueId;
    this.implementAgent = implementAgent;
  }
}

export interface ClaudeCodeSessionRecord {
  contract: "ClaudeCodeSession";
  version: "1.0";
  issue_id: number;
  implement_agent: string;
  branch: string;
  allowed_paths: string[];
  runtime: "claude-code";
  context_hint: string;
  created_at: string;
  expires_at: string;
}

/** Resolve implement runtime from env, manifest routing, plan, or triage complexity. */
export function resolveImplementRuntime(
  manifest: Manifest,
  opts?: {
    plan?: Record<string, unknown>;
    triage?: Record<string, unknown>;
  }
): ImplementRuntime {
  const env = process.env.IMPLEMENT_RUNTIME?.toLowerCase();
  if (env === "claude-code") return "claude-code";
  if (env === "cloud-agent") return "cloud-agent";

  const planRuntime = String(opts?.plan?.runtime ?? "").toLowerCase();
  if (planRuntime === "claude-code") return "claude-code";

  const routing = manifest.agent_routing;
  if (routing?.complex_refactor === "claude-code") {
    const complexity = String(opts?.triage?.complexity ?? "").toUpperCase();
    const area = String(
      (opts?.triage?.routing as { area?: string } | undefined)?.area ?? ""
    ).toLowerCase();
    if (complexity === "L" || complexity === "XL" || area === "unknown") {
      return "claude-code";
    }
  }

  return "cloud-agent";
}

export function buildClaudeCodeSession(opts: {
  issueId: number;
  implementAgent: string;
  branch: string;
  allowedPaths: string[];
}): ClaudeCodeSessionRecord {
  const created = new Date();
  const expires = new Date(created.getTime() + 4 * 60 * 60 * 1000);
  return {
    contract: "ClaudeCodeSession",
    version: "1.0",
    issue_id: opts.issueId,
    implement_agent: opts.implementAgent,
    branch: opts.branch,
    allowed_paths: opts.allowedPaths,
    runtime: "claude-code",
    context_hint: `.ai-platform/runs/${opts.issueId}/context-pack.json`,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
  };
}

export function formatClaudeCodeSessionComment(
  session: ClaudeCodeSessionRecord
): string {
  return [
    machineMarker("claude-code-session"),
    "## Claude Code session required",
    `${humanAgentName(session.implement_agent)} is configured for **Claude Code** runtime.`,
    formatKeyValueTable([
      ["Branch", `\`${session.branch}\``],
      ["Expires", session.expires_at],
      ["Allowed paths", session.allowed_paths.map((p) => `\`${p}\``).join(", ")],
      ["Context pack", `\`${session.context_hint}\``],
    ]),
    "### Next steps",
    "",
    "1. Open Claude Code with the context pack above",
    `2. Implement on branch \`${session.branch}\` within allowed paths`,
    "3. Submit changes and resume:",
    "",
    "```bash",
    `node dist/cli.js submit-code-changes --issue ${session.issue_id} --agent ${session.implement_agent} --file changes.json`,
    `node dist/cli.js resume --issue ${session.issue_id} --from qa-gate`,
    "```",
    "",
    "_Set `IMPLEMENT_RUNTIME=cloud-agent` to force cloud dispatch instead._",
  ].join("\n");
}
