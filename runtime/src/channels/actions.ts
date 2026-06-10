import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { scaffoldFromTemplate } from "../scaffold-from-template.js";
import { GitHubClient } from "../github.js";
import {
  buildKnowledgeIndex,
  saveKnowledgeIndex,
  knowledgeApprovalsPath,
  type KnowledgeLayer,
} from "../knowledge-index.js";
import { loadManifest } from "../context-builder.js";
import { getPlatformRoot } from "../config.js";
import { writeAdrDraft, type AdrStatus } from "./adr-generator.js";
import {
  defaultFeatureIssueLabels,
  formatFeatureIssueBody,
} from "./feature-issue.js";
import { linkIssueToChannelSession } from "./issue-channel-link.js";
import type { ChannelAction, ChannelConversationSession } from "./types.js";

export interface ActionContext {
  projectDir: string;
  session: ChannelConversationSession;
  github?: GitHubClient;
}

export async function applyChannelActions(
  actions: ChannelAction[] | undefined,
  ctx: ActionContext
): Promise<string[]> {
  const applied: string[] = [];
  if (!actions?.length) return applied;

  for (const action of actions) {
    switch (action.type) {
      case "write_knowledge":
        applied.push(applyWriteKnowledge(action, ctx));
        break;
      case "write_adr":
        applied.push(applyWriteAdr(action, ctx));
        break;
      case "approve_layer":
        applied.push(applyApproveLayer(action, ctx));
        break;
      case "scaffold_project":
        applied.push(await applyScaffoldProject(action, ctx));
        break;
      case "create_github_issue":
        applied.push(await applyCreateIssue(action, ctx));
        break;
      case "ask_clarification":
      case "noop":
        break;
      default:
        applied.push(`skipped:unknown_action:${(action as ChannelAction).type}`);
    }
  }

  if (
    applied.some(
      (a) =>
        a.startsWith("write_knowledge:") ||
        a.startsWith("write_adr:") ||
        a.startsWith("approve_layer:")
    )
  ) {
    try {
      const manifest = loadManifest(ctx.projectDir);
      const index = buildKnowledgeIndex(ctx.projectDir, manifest);
      saveKnowledgeIndex(ctx.projectDir, index);
    } catch {
      /* index optional if manifest missing during intake */
    }
  }

  return applied;
}

function applyWriteKnowledge(action: ChannelAction, ctx: ActionContext): string {
  const layer = action.layer ?? "business";
  const rel = action.path ?? "notes.md";
  const safe = rel.replace(/\.\./g, "").replace(/^\/+/, "");
  const dest = path.join(ctx.projectDir, "docs", "knowledge", layer, safe);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  let content = action.content ?? "";
  if (!content.trim().startsWith("---")) {
    content = `---\nstatus: draft\n---\n\n${content}`;
  }
  fs.writeFileSync(dest, content);
  ctx.session.artifacts_written.push(`docs/knowledge/${layer}/${safe}`);
  return `write_knowledge:${layer}/${safe}`;
}

function applyWriteAdr(action: ChannelAction, ctx: ActionContext): string {
  const title = action.title?.trim();
  const context = action.context?.trim();
  const decision = action.decision?.trim();
  if (!title || !context || !decision) {
    return "write_adr:skipped_incomplete";
  }

  const { entry } = writeAdrDraft(
    ctx.projectDir,
    {
      title,
      context,
      decision,
      consequences: action.consequences,
      status: action.status as AdrStatus | undefined,
      slug: action.slug,
      references: action.references,
    },
    { platformRoot: getPlatformRoot() }
  );
  ctx.session.artifacts_written.push(entry.path);
  return `write_adr:${entry.path}`;
}

function applyApproveLayer(action: ChannelAction, ctx: ActionContext): string {
  const layer = (action.layer ?? "business") as KnowledgeLayer;
  const p = knowledgeApprovalsPath(ctx.projectDir);
  let approvals: { version?: string; layers?: Record<string, string> } = {};
  if (fs.existsSync(p)) {
    approvals = YAML.parse(fs.readFileSync(p, "utf8")) as typeof approvals;
  }
  approvals.version = approvals.version ?? "1.0";
  approvals.layers = approvals.layers ?? {};
  approvals.layers[layer] = "approved";
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, YAML.stringify(approvals));
  return `approve_layer:${layer}`;
}

async function applyScaffoldProject(action: ChannelAction, ctx: ActionContext): Promise<string> {
  const template = action.template ?? "express-api";
  const projectId = action.project_id ?? ctx.session.project_id;
  const target = action.target_dir ?? ctx.projectDir;
  scaffoldFromTemplate({
    targetDir: target,
    templateId: template,
    projectId,
  });
  return `scaffold_project:${template}→${target}`;
}

async function applyCreateIssue(action: ChannelAction, ctx: ActionContext): Promise<string> {
  if (!ctx.github) {
    return "create_github_issue:skipped_no_github";
  }
  const title = action.title ?? "Feature request";
  const body = formatFeatureIssueBody({
    title,
    body: action.body,
    user_story: action.user_story,
    acceptance_criteria: action.acceptance_criteria,
    area: action.area,
    priority: action.priority,
    notes: action.notes,
    source: {
      provider: ctx.session.address.provider,
      channel_id: ctx.session.address.channel_id,
      thread_id: ctx.session.address.thread_id,
      session_id: ctx.session.session_id,
    },
  });
  const labels =
    action.labels?.length ?
      action.labels
    : defaultFeatureIssueLabels({
        title,
        area: action.area,
        priority: action.priority,
      });

  const { data } = await ctx.github.octokit.issues.create({
    owner: ctx.github.owner,
    repo: ctx.github.repo,
    title,
    body,
    labels,
  });

  linkIssueToChannelSession(ctx.projectDir, data.number, ctx.session);
  ctx.session.artifacts_written.push(`github:issue:${data.number}`);
  return `create_github_issue:#${data.number}`;
}
