import fs from "node:fs";
import path from "node:path";
import { getPlatformRoot } from "./config.js";
import { writeDefaultProjectLifecycle } from "./project-lifecycle.js";

export interface OnboardResult {
  contract: "OnboardResult";
  version: "1.0";
  target_dir: string;
  project_id: string;
  client_tier: string;
  copied_paths: string[];
  skipped_paths: string[];
}

function copyRecursive(src: string, dest: string, copied: string[]): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), copied);
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied.push(dest);
}

export function onboardProject(opts: {
  targetDir: string;
  projectId: string;
  clientTier?: string;
  platformRoot?: string;
}): OnboardResult {
  const platformRoot = opts.platformRoot ?? getPlatformRoot();
  const templateRoot = path.join(platformRoot, "templates", "project-repo");
  const target = path.resolve(opts.targetDir);
  const copied: string[] = [];
  const skipped: string[] = [];

  if (!fs.existsSync(templateRoot)) {
    throw new Error(`Template not found: ${templateRoot}`);
  }

  fs.mkdirSync(target, { recursive: true });
  copyRecursive(templateRoot, target, copied);

  const manifestPath = path.join(target, ".ai-platform", "manifest.yaml");
  if (fs.existsSync(manifestPath)) {
    let raw = fs.readFileSync(manifestPath, "utf8");
    raw = raw.replace(/project_id:\s*["']?CHANGE_ME["']?/, `project_id: ${opts.projectId}`);
    if (opts.clientTier) {
      raw = raw.replace(
        /client_tier:\s*\w+/,
        `client_tier: ${opts.clientTier}`
      );
    }
    fs.writeFileSync(manifestPath, raw);
  } else {
    skipped.push(manifestPath);
  }

  const knowledgeApprovals = path.join(target, ".ai-platform", "knowledge", "approvals.yaml");
  if (!fs.existsSync(knowledgeApprovals)) {
    fs.mkdirSync(path.dirname(knowledgeApprovals), { recursive: true });
    fs.writeFileSync(
      knowledgeApprovals,
      "version: \"1.0\"\nlayers:\n  business: draft\n  product: draft\n  technical: draft\n"
    );
    copied.push(knowledgeApprovals);
  }

  for (const layer of ["business", "product", "technical"]) {
    const kdir = path.join(target, "docs", "knowledge", layer);
    fs.mkdirSync(kdir, { recursive: true });
    const readme = path.join(kdir, "README.md");
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, `# Knowledge — ${layer}\n\nApproved by Knowledge Owner before agent use.\n`);
      copied.push(readme);
    }
  }

  const lifecyclePath = writeDefaultProjectLifecycle(target, platformRoot);
  copied.push(lifecyclePath);

  return {
    contract: "OnboardResult",
    version: "1.0",
    target_dir: target,
    project_id: opts.projectId,
    client_tier: opts.clientTier ?? "standard",
    copied_paths: copied,
    skipped_paths: skipped,
  };
}
