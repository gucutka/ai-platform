import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CodeChanges, Manifest } from "./types.js";

export interface CiCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export interface CiRunResult {
  success: boolean;
  ci_status: "passed" | "failed" | "skipped";
  workspace: string;
  commands: CiCommandResult[];
  duration_ms: number;
  error?: string;
}

const DEFAULT_PROFILE: Record<string, { install: string; test: string }> = {
  "node-monorepo": { install: "npm ci", test: "npm test" },
  node: { install: "npm ci", test: "npm test" },
};

export function resolveCiCommands(manifest: Manifest): { install: string; test: string } {
  const profile = manifest.runtime_profile ?? "node-monorepo";
  const custom = manifest.ci;
  const defaults = DEFAULT_PROFILE[profile] ?? DEFAULT_PROFILE["node-monorepo"];
  return {
    install: custom?.install ?? defaults.install,
    test: custom?.test ?? defaults.test,
  };
}

export function createCiWorkspace(
  projectDir: string,
  changes: CodeChanges
): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-platform-ci-"));
  copyProjectTree(projectDir, tmp);

  for (const file of changes.files) {
    const dest = path.join(tmp, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
  }

  return tmp;
}

function copyProjectTree(src: string, dest: string): void {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => {
      const rel = path.relative(src, p);
      if (!rel) return true;
      return (
        !rel.startsWith("node_modules") &&
        !rel.startsWith(".git") &&
        !rel.startsWith(".ai-platform/runs") &&
        !rel.startsWith(".ai-platform/audit") &&
        !rel.startsWith(".ai-platform/evaluation")
      );
    },
  });
}

export function runCiInWorkspace(
  workspace: string,
  manifest: Manifest,
  opts?: { timeoutMs?: number }
): CiRunResult {
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const commands: CiCommandResult[] = [];
  const { install, test } = resolveCiCommands(manifest);

  if (!fs.existsSync(path.join(workspace, "package.json"))) {
    return {
      success: false,
      ci_status: "skipped",
      workspace,
      commands,
      duration_ms: Date.now() - start,
      error: "no package.json — CI skipped",
    };
  }

  for (const command of [install, test]) {
    const cmdStart = Date.now();
    try {
      const out = execSync(command, {
        cwd: workspace,
        encoding: "utf8",
        timeout: timeoutMs,
        env: { ...process.env, NODE_ENV: "test", CI: "true" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      commands.push({
        command,
        exitCode: 0,
        stdout: tail(out, 4000),
        stderr: "",
        duration_ms: Date.now() - cmdStart,
      });
    } catch (err) {
      const e = err as {
        status?: number;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      commands.push({
        command,
        exitCode: e.status ?? 1,
        stdout: tail(String(e.stdout ?? ""), 4000),
        stderr: tail(String(e.stderr ?? e.message ?? ""), 4000),
        duration_ms: Date.now() - cmdStart,
      });
      return {
        success: false,
        ci_status: "failed",
        workspace,
        commands,
        duration_ms: Date.now() - start,
        error: `${command} exited ${e.status ?? 1}`,
      };
    }
  }

  return {
    success: true,
    ci_status: "passed",
    workspace,
    commands,
    duration_ms: Date.now() - start,
  };
}

export function runCiWithChanges(
  projectDir: string,
  changes: CodeChanges,
  manifest: Manifest
): CiRunResult {
  const workspace = createCiWorkspace(projectDir, changes);
  try {
    return runCiInWorkspace(workspace, manifest);
  } finally {
    try {
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  return "…\n" + text.slice(-max);
}
