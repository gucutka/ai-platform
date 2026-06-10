import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import { onboardProject } from "./onboard-project.js";
import { writeDefaultProjectLifecycle } from "./project-lifecycle.js";

export interface AppTemplateEntry {
  label: string;
  description: string;
  tags: string[];
  stack: Record<string, string>;
  default_tier: string;
  seed_knowledge: boolean;
  skeleton: string;
}

export interface AppTemplateCatalog {
  version: string;
  templates: Record<string, AppTemplateEntry>;
}

export interface ScaffoldResult {
  contract: "ScaffoldResult";
  version: "1.0";
  template_id: string;
  target_dir: string;
  project_id: string;
  client_tier: string;
  copied_paths: string[];
  onboard: ReturnType<typeof onboardProject>;
}

function appsRoot(platformRoot?: string): string {
  return path.join(platformRoot ?? getPlatformRoot(), "templates", "apps");
}

export function loadAppTemplateCatalog(platformRoot?: string): AppTemplateCatalog {
  const file = path.join(appsRoot(platformRoot), "catalog.yaml");
  if (!fs.existsSync(file)) {
    throw new Error(`App template catalog not found: ${file}`);
  }
  return YAML.parse(fs.readFileSync(file, "utf8")) as AppTemplateCatalog;
}

export function listAppTemplates(platformRoot?: string): { id: string; entry: AppTemplateEntry }[] {
  const catalog = loadAppTemplateCatalog(platformRoot);
  return Object.entries(catalog.templates).map(([id, entry]) => ({ id, entry }));
}

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

function seedKnowledgeFromTemplate(
  target: string,
  templateRoot: string,
  copied: string[]
): void {
  const knowledgeSrc = path.join(templateRoot, "knowledge");
  if (!fs.existsSync(knowledgeSrc)) return;
  copyRecursive(knowledgeSrc, path.join(target, "docs", "knowledge"), copied);
}

export function scaffoldFromTemplate(opts: {
  templateId: string;
  targetDir: string;
  projectId: string;
  clientTier?: string;
  platformRoot?: string;
  skipOnboard?: boolean;
}): ScaffoldResult {
  const platformRoot = opts.platformRoot ?? getPlatformRoot();
  const catalog = loadAppTemplateCatalog(platformRoot);
  const entry = catalog.templates[opts.templateId];
  if (!entry) {
    throw new Error(`Unknown app template: ${opts.templateId}`);
  }

  const skeletonRoot = path.join(appsRoot(platformRoot), entry.skeleton);
  if (!fs.existsSync(skeletonRoot)) {
    throw new Error(`Template skeleton not found: ${skeletonRoot}`);
  }

  const target = path.resolve(opts.targetDir);
  const copied: string[] = [];
  fs.mkdirSync(target, { recursive: true });

  copyRecursive(skeletonRoot, target, copied);
  seedKnowledgeFromTemplate(target, path.join(appsRoot(platformRoot), opts.templateId), copied);

  const pkgPath = path.join(target, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
    pkg.name = opts.projectId;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  let onboard = {
    contract: "OnboardResult" as const,
    version: "1.0" as const,
    target_dir: target,
    project_id: opts.projectId,
    client_tier: opts.clientTier ?? entry.default_tier,
    copied_paths: [] as string[],
    skipped_paths: [] as string[],
  };

  if (!opts.skipOnboard) {
    onboard = onboardProject({
      targetDir: target,
      projectId: opts.projectId,
      clientTier: opts.clientTier ?? entry.default_tier,
      platformRoot,
    });
    copied.push(...onboard.copied_paths);

    const manifestPath = path.join(target, ".ai-platform", "manifest.yaml");
    if (fs.existsSync(manifestPath)) {
      let raw = fs.readFileSync(manifestPath, "utf8");
      if (!raw.includes("app_template:")) {
        raw = raw.replace(
          /project_id:\s*.+/,
          (m) => `${m}\napp_template: ${opts.templateId}`
        );
      }
      fs.writeFileSync(manifestPath, raw);
    }

    writeDefaultProjectLifecycle(target, platformRoot);
    copied.push(path.join(target, ".ai-platform", "project-lifecycle.yaml"));
  }

  return {
    contract: "ScaffoldResult",
    version: "1.0",
    template_id: opts.templateId,
    target_dir: target,
    project_id: opts.projectId,
    client_tier: opts.clientTier ?? entry.default_tier,
    copied_paths: copied,
    onboard,
  };
}

export function matchAppTemplateByTags(
  tags: string[],
  platformRoot?: string
): string | null {
  const catalog = loadAppTemplateCatalog(platformRoot);
  let best: { id: string; score: number } | null = null;
  const want = new Set(tags.map((t) => t.toLowerCase()));

  for (const [id, entry] of Object.entries(catalog.templates)) {
    const score = entry.tags.filter((t) => want.has(t.toLowerCase())).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { id, score };
    }
  }
  return best?.id ?? null;
}
