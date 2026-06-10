import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getPlatformRoot(): string {
  return process.env.PLATFORM_ROOT ?? path.resolve(__dirname, "../..");
}

export function getProjectDir(): string {
  return process.env.PROJECT_DIR ?? process.cwd();
}

export function getRunsDir(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "runs");
}
