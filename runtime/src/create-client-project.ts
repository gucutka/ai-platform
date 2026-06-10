import fs from "node:fs";
import path from "node:path";
import { getPlatformRoot } from "./config.js";
import { onboardProject } from "./onboard-project.js";

export interface CreateClientProjectOpts {
  targetDir: string;
  projectId: string;
  clientTier?: string;
  /** GitHub org/user owning client repos and ai-platform (replaces YOUR_ORG). */
  platformOwner: string;
  /** e.g. ai-platform — repo name of the control plane. */
  platformRepo?: string;
  platformRoot?: string;
}

export interface CreateClientProjectResult {
  contract: "CreateClientProjectResult";
  version: "1.0";
  target_dir: string;
  project_id: string;
  platform_repository: string;
  copied_paths: string[];
}

const TEXT_EXTENSIONS = new Set([".yaml", ".yml", ".md", ".json", ".txt"]);

function copyRecursive(src: string, dest: string, copied: string[]): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === "node_modules" || entry === ".git") continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry), copied);
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied.push(dest);
}

function substituteInTree(root: string, replacements: Record<string, string>): void {
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(entry).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      let text = fs.readFileSync(full, "utf8");
      let changed = false;
      for (const [from, to] of Object.entries(replacements)) {
        if (text.includes(from)) {
          text = text.split(from).join(to);
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(full, text);
    }
  };
  walk(root);
}

function writeReadme(
  target: string,
  opts: { projectId: string; platformRepository: string; platformOwner: string }
): void {
  const readme = `# ${opts.projectId}

Client repository for [Agentic SDLC](https://github.com/${opts.platformRepository}).

## Setup (GitHub — no local runtime required)

1. **Repository variable** (Settings → Variables → Actions):
   \`AI_PLATFORM_REPOSITORY\` = \`${opts.platformRepository}\`
2. **Secrets** (org or repo): \`ANTHROPIC_API_KEY\`, \`GH_PAT\` (checkout ai-platform), \`SLACK_BOT_TOKEN\`, \`SLACK_SIGNING_SECRET\` (for Slack channel events).
3. **Slack**: bind channels in \`.ai-platform/channels.yaml\`, then route events to \`channel-events.yml\` (see platform docs).
4. **Knowledge**: agents write to \`docs/knowledge/\`; approve layers in \`.ai-platform/knowledge/approvals.yaml\`.

Created by \`create-client-project\` from ai-platform \`templates/project-repo/\`.
`;
  fs.writeFileSync(path.join(target, "README.md"), readme);
}

/** Scaffold infra-only client repo (manifest, knowledge, GitHub workflows). */
export function createClientProject(opts: CreateClientProjectOpts): CreateClientProjectResult {
  const platformRoot = opts.platformRoot ?? getPlatformRoot();
  const platformRepo = opts.platformRepo ?? "ai-platform";
  const platformRepository = `${opts.platformOwner}/${platformRepo}`;
  const target = path.resolve(opts.targetDir);
  const copied: string[] = [];

  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`Target directory is not empty: ${target}`);
  }

  const onboard = onboardProject({
    targetDir: target,
    projectId: opts.projectId,
    clientTier: opts.clientTier,
    platformRoot,
  });
  copied.push(...onboard.copied_paths);

  const templatesRoot = path.join(platformRoot, "templates");
  copyRecursive(
    path.join(templatesRoot, "ISSUE_TEMPLATE"),
    path.join(target, ".github", "ISSUE_TEMPLATE"),
    copied
  );
  const prTemplate = path.join(templatesRoot, "PULL_REQUEST_TEMPLATE.md");
  if (fs.existsSync(prTemplate)) {
    const dest = path.join(target, ".github", "PULL_REQUEST_TEMPLATE.md");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(prTemplate, dest);
    copied.push(dest);
  }

  substituteInTree(target, {
    YOUR_ORG: opts.platformOwner,
    YOUR_GITHUB_OWNER: opts.platformOwner,
    "CHANGE_ME": opts.projectId,
  });

  writeReadme(target, {
    projectId: opts.projectId,
    platformRepository,
    platformOwner: opts.platformOwner,
  });
  copied.push(path.join(target, "README.md"));

  return {
    contract: "CreateClientProjectResult",
    version: "1.0",
    target_dir: target,
    project_id: opts.projectId,
    platform_repository: platformRepository,
    copied_paths: copied,
  };
}
