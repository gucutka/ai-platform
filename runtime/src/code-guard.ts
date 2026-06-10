import { minimatch } from "minimatch";
import type { CodeChanges, Manifest } from "./types.js";
import { isCanonicalKnowledgePath } from "./knowledge-index.js";

const STUB_PATTERNS = [
  /\/\/\s*TODO\b/i,
  /\/\*\s*TODO\b/i,
  /#\s*TODO\b/i,
  /\/\/\s*FIXME\b/i,
  /throw new Error\(['"]not implemented/i,
];

const LOCKFILE = "package-lock.json";

/** Default infra/IaC globs when infra-implement-agent runs. */
export const DEFAULT_INFRA_ALLOWED_PATHS = [
  ".github/**",
  "docker/**",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.*.yml",
  "terraform/**",
  "**/*.tf",
  "**/*.tfvars",
];

export function resolveAllowedPaths(
  manifest: Manifest,
  agentId?: string
): string[] {
  const base = manifest.allowed_paths ?? ["src/**", "tests/**"];
  if (agentId !== "infra-implement-agent") return base;
  const extra = manifest.infra_allowed_paths ?? DEFAULT_INFRA_ALLOWED_PATHS;
  return [...new Set([...base, ...extra])];
}

function shouldScanForStubs(filePath: string): boolean {
  if (filePath === "package.json" || filePath === LOCKFILE) return false;
  return /\.(js|ts|jsx|tsx|mjs|cjs|py|go|rs|java|vue|svelte|tf|hcl|yaml|yml)$/i.test(
    filePath
  );
}

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i,
  /\bsk-[a-zA-Z0-9]{20,}/,
  /\bghp_[a-zA-Z0-9]{20,}/,
];

export interface CodeGuardResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function collectPlanFilePaths(plan: {
  tasks?: { files?: string[] }[];
} | null): Set<string> {
  const paths = new Set<string>();
  for (const task of plan?.tasks ?? []) {
    for (const f of task.files ?? []) {
      if (f) paths.add(f);
    }
  }
  return paths;
}

/** CodeChanges.files must match ImplementationPlan task files (+ lockfile when package.json is planned). */
export function validateCodeChangesAgainstPlan(
  changes: CodeChanges,
  plan: { tasks?: { files?: string[] }[] } | null
): string[] {
  const planPaths = collectPlanFilePaths(plan);
  if (planPaths.size === 0) return [];

  const errors: string[] = [];
  const planHasPkg = planPaths.has("package.json");

  for (const file of changes.files) {
    if (planPaths.has(file.path)) continue;
    if (file.path === LOCKFILE) {
      if (!planHasPkg && !changes.files.some((f) => f.path === "package.json")) {
        errors.push("package-lock.json included but package.json is not in ImplementationPlan");
      }
      continue;
    }
    errors.push(`file not in ImplementationPlan.tasks: ${file.path}`);
  }

  return errors;
}

export function validateCodeChanges(
  changes: CodeChanges,
  manifest: Manifest,
  plan?: { tasks?: { files?: string[] }[] } | null,
  agentId?: string
): CodeGuardResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allowed = resolveAllowedPaths(manifest, agentId);

  if (!changes.files?.length) {
    errors.push("CodeChanges.files is empty");
    return { valid: false, errors, warnings };
  }

  const paths = new Set<string>();
  for (const file of changes.files) {
    if (!file.path || file.content === undefined) {
      errors.push("invalid file entry: path and content required");
      continue;
    }
    if (paths.has(file.path)) {
      errors.push(`duplicate path: ${file.path}`);
    }
    paths.add(file.path);

    if (isCanonicalKnowledgePath(file.path)) {
      errors.push(
        `canonical knowledge path is read-only for agents: ${file.path} (Knowledge Owner approval required)`
      );
    }

    if (!isPathAllowed(file.path, allowed) && file.path !== LOCKFILE) {
      errors.push(`path not in allowed_paths: ${file.path}`);
    }

    if (shouldScanForStubs(file.path)) {
      for (const pat of STUB_PATTERNS) {
        if (pat.test(file.content)) {
          errors.push(`stub/placeholder pattern in ${file.path}`);
          break;
        }
      }
    }

    for (const pat of SECRET_PATTERNS) {
      if (pat.test(file.content)) {
        errors.push(`possible secret in ${file.path}`);
        break;
      }
    }
  }

  const pkg = changes.files.find((f) => f.path === "package.json");
  const lock = changes.files.find((f) => f.path === "package-lock.json");
  if (pkg && !lock) {
    errors.push(
      "package.json changed but package-lock.json missing — run npm install and include lockfile"
    );
  }

  if (agentId !== "infra-implement-agent") {
    if (pkg?.content && !/"test"\s*:/.test(pkg.content)) {
      warnings.push("package.json has no test script");
    }

    const testFiles = changes.files.filter((f) =>
      /(?:^tests\/|\.test\.|\.spec\.)/.test(f.path)
    );
    if (testFiles.length === 0 && changes.files.some((f) => f.path.startsWith("src/"))) {
      warnings.push("no test files in CodeChanges");
    }
  }

  for (const msg of validateCodeChangesAgainstPlan(changes, plan ?? null)) {
    errors.push(msg);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function isPathAllowed(filePath: string, allowed: string[]): boolean {
  return allowed.some((pat) => minimatch(filePath, pat, { dot: true }));
}
