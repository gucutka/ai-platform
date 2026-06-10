import fs from "node:fs";
import path from "node:path";
import type { RuntimeAgentDef } from "./types.js";
import { getPlatformRoot } from "./config.js";

function readSkillMd(categoryPath: string, skillId: string): string {
  const base = path.join(getPlatformRoot(), "skills", categoryPath, skillId, "skill.md");
  if (!fs.existsSync(base)) return "";
  const yamlPath = path.join(getPlatformRoot(), "skills", categoryPath, skillId, "skill.yaml");
  let maxLen = 2000;
  if (fs.existsSync(yamlPath)) {
    const raw = fs.readFileSync(yamlPath, "utf8");
    if (raw.includes("production_grade: true")) maxLen = 10000;
  }
  const raw = fs.readFileSync(base, "utf8");
  return raw.replace(/^---[\s\S]*?---\n/, "").trim().slice(0, maxLen);
}

export function loadSkillsForAgent(
  def: RuntimeAgentDef,
  extraSkillIds?: { core?: string[]; sdlc?: string[]; technology?: string[] }
): string {
  const parts: string[] = [];
  const s = {
    core: [...(def.skills?.core ?? []), ...(extraSkillIds?.core ?? [])],
    sdlc: [...(def.skills?.sdlc ?? []), ...(extraSkillIds?.sdlc ?? [])],
    technology: [
      ...(def.skills?.technology ?? []),
      ...(extraSkillIds?.technology ?? []),
    ],
  };
  for (const id of [...new Set(s.core)]) {
    const t = readSkillMd("core", id);
    if (t) parts.push(`## Core: ${id}\n${t}`);
  }
  for (const id of [...new Set(s.sdlc)]) {
    const t = readSkillMd("sdlc", id);
    if (t) parts.push(`## SDLC: ${id}\n${t}`);
  }
  for (const id of [...new Set(s.technology)]) {
    for (const cat of ["frontend", "backend", "infrastructure", "database", "testing", "documentation"]) {
      const t = readSkillMd(`technology/${cat}`, id);
      if (t) {
        parts.push(`## Tech: ${id}\n${t}`);
        break;
      }
    }
  }
  return parts.join("\n\n").slice(0, 8000);
}
