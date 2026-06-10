import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getProjectDir } from "./config.js";

export interface AgentOptimizationHint {
  agent: string;
  sample_count: number;
  avg_score: number;
  what_worked: string[];
  what_failed: string[];
  recommended_improvements: string[];
  root_causes: string[];
}

export interface OptimizationHintsFile {
  version: "1.0";
  updated_at: string;
  agents: Record<string, AgentOptimizationHint>;
  prompt_additions: Record<string, string>;
}

function optimizationRoot(projectDir: string): string {
  return path.join(projectDir ?? getProjectDir(), ".ai-platform", "optimization");
}

export function syncOptimizationHints(projectDir: string): OptimizationHintsFile {
  const root = optimizationRoot(projectDir);
  const agents: Record<string, AgentOptimizationHint> = {};

  if (fs.existsSync(root)) {
    for (const issueDir of fs.readdirSync(root)) {
      if (!/^\d+$/.test(issueDir)) continue;
      const dir = path.join(root, issueDir);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith("-latest.json")) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
            agent_score?: number;
            what_worked?: string[];
            what_failed?: string[];
            recommended_improvements?: string[];
            root_cause?: string | null;
          };
          const agent = file.replace("-latest.json", "");
          const cur = agents[agent] ?? {
            agent,
            sample_count: 0,
            avg_score: 0,
            what_worked: [],
            what_failed: [],
            recommended_improvements: [],
            root_causes: [],
          };
          cur.sample_count += 1;
          cur.avg_score =
            (cur.avg_score * (cur.sample_count - 1) + (data.agent_score ?? 0)) /
            cur.sample_count;
          cur.what_worked.push(...(data.what_worked ?? []));
          cur.what_failed.push(...(data.what_failed ?? []));
          cur.recommended_improvements.push(...(data.recommended_improvements ?? []));
          if (data.root_cause) cur.root_causes.push(data.root_cause);
          agents[agent] = cur;
        } catch {
          /* skip */
        }
      }
    }
  }

  const prompt_additions: Record<string, string> = {};
  for (const [agentId, hint] of Object.entries(agents)) {
    const topFails = [...new Set(hint.what_failed)].slice(0, 3);
    const topRecs = [...new Set(hint.recommended_improvements)].slice(0, 3);
    if (!topFails.length && !topRecs.length) continue;
    const lines = [
      "## Optimization feedback (auto-generated)",
      hint.avg_score > 0 ? `Recent avg score: ${hint.avg_score.toFixed(0)}/100` : "",
      topFails.length ? `Avoid: ${topFails.join("; ")}` : "",
      topRecs.length ? `Improve: ${topRecs.join("; ")}` : "",
    ].filter(Boolean);
    prompt_additions[agentId] = lines.join("\n");
  }

  const out: OptimizationHintsFile = {
    version: "1.0",
    updated_at: new Date().toISOString(),
    agents,
    prompt_additions,
  };

  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "hints.yaml"), YAML.stringify(out));
  fs.writeFileSync(path.join(root, "hints.json"), JSON.stringify(out, null, 2));
  return out;
}

export function loadOptimizationHints(projectDir: string): OptimizationHintsFile | null {
  const p = path.join(optimizationRoot(projectDir), "hints.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as OptimizationHintsFile;
}

export function optimizationHintForAgent(
  projectDir: string,
  agentId: string
): string {
  const hints = loadOptimizationHints(projectDir);
  return hints?.prompt_additions[agentId] ?? "";
}
