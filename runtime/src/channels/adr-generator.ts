import fs from "node:fs";
import path from "node:path";
import { getPlatformRoot } from "../config.js";

export type AdrStatus = "Proposed" | "Under Review" | "Accepted" | "Deprecated" | "Superseded";

export interface AdrEntry {
  number: number;
  slug: string;
  title: string;
  status: AdrStatus;
  path: string;
}

export interface AdrDraftInput {
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  status?: AdrStatus;
  slug?: string;
  references?: string[];
}

export function adrDirectory(projectDir: string): string {
  return path.join(projectDir, "docs", "knowledge", "technical", "adr");
}

export function slugifyAdrTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function parseAdrFilename(name: string): { number: number; slug: string } | null {
  const m = name.match(/^ADR-(\d+)-(.+)\.md$/i);
  if (!m) return null;
  return { number: parseInt(m[1], 10), slug: m[2] };
}

export function listAdrs(projectDir: string): AdrEntry[] {
  const dir = adrDirectory(projectDir);
  if (!fs.existsSync(dir)) return [];

  const entries: AdrEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const parsed = parseAdrFilename(name);
    if (!parsed) continue;
    const full = path.join(dir, name);
    const raw = fs.readFileSync(full, "utf8");
    const titleMatch = raw.match(/^#\s*ADR-\d+:\s*(.+)$/m);
    const statusMatch = raw.match(/^## Status\s*\r?\n([^\r\n#]+)/m);
    entries.push({
      number: parsed.number,
      slug: parsed.slug,
      title: titleMatch?.[1]?.trim() ?? parsed.slug,
      status: (statusMatch?.[1]?.trim() as AdrStatus) ?? "Proposed",
      path: `docs/knowledge/technical/adr/${name}`,
    });
  }
  return entries.sort((a, b) => a.number - b.number);
}

export function nextAdrNumber(projectDir: string): number {
  const adrs = listAdrs(projectDir);
  if (!adrs.length) return 1;
  return Math.max(...adrs.map((a) => a.number)) + 1;
}

function defaultAdrTemplate(platformRoot?: string): string {
  const templatePath = path.join(
    platformRoot ?? getPlatformRoot(),
    "knowledge",
    "technical",
    "templates",
    "adr-template.md"
  );
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf8");
  }
  return `# ADR-NNN: Title

## Status
Proposed

## Context

## Decision

## Consequences

## References

---
Owner: Architect | Layer: Technical
`;
}

export function buildAdrMarkdown(
  input: AdrDraftInput,
  opts?: { number?: number; platformRoot?: string }
): { filename: string; content: string; number: number; slug: string } {
  const number = opts?.number ?? 1;
  const slug = input.slug ?? slugifyAdrTitle(input.title);
  const status = input.status ?? "Proposed";
  const refs =
    input.references?.length ?
      input.references.map((r) => `- ${r}`).join("\n")
    : "_None yet_";

  let body = defaultAdrTemplate(opts?.platformRoot);
  body = body.replace(/^#\s*ADR-NNN:.*$/m, `# ADR-${String(number).padStart(3, "0")}: ${input.title}`);
  body = body.replace(
    /^## Status\s*\r?\n[^\r\n#]*/m,
    `## Status\n${status}`
  );
  body = body.replace(
    /^## Context\s*\r?\n[\s\S]*?(?=^## Decision)/m,
    `## Context\n\n${input.context.trim()}\n\n`
  );
  body = body.replace(
    /^## Decision\s*\r?\n[\s\S]*?(?=^## Consequences)/m,
    `## Decision\n\n${input.decision.trim()}\n\n`
  );
  body = body.replace(
    /^## Consequences\s*\r?\n[\s\S]*?(?=^## References)/m,
    `## Consequences\n\n${(input.consequences ?? "_To be refined during review._").trim()}\n\n`
  );
  body = body.replace(/^## References\s*\r?\n[\s\S]*?(?=^---|$)/m, `## References\n\n${refs}\n\n`);

  if (!body.trimStart().startsWith("---")) {
    body = `---\nstatus: draft\nlayer: technical\nkind: adr\n---\n\n${body}`;
  }

  const filename = `ADR-${String(number).padStart(3, "0")}-${slug}.md`;
  return { filename, content: body, number, slug };
}

export function writeAdrDraft(
  projectDir: string,
  input: AdrDraftInput,
  opts?: { platformRoot?: string }
): { path: string; entry: AdrEntry } {
  const number = nextAdrNumber(projectDir);
  const built = buildAdrMarkdown(input, { number, platformRoot: opts?.platformRoot });
  const dir = adrDirectory(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, built.filename);
  fs.writeFileSync(dest, built.content);

  const entry: AdrEntry = {
    number: built.number,
    slug: built.slug,
    title: input.title,
    status: input.status ?? "Proposed",
    path: `docs/knowledge/technical/adr/${built.filename}`,
  };
  return { path: dest, entry };
}

export function formatAdrIndexMarkdown(adrs: AdrEntry[]): string {
  if (!adrs.length) return "_No ADRs yet._";
  return adrs
    .map(
      (a) =>
        `- **ADR-${String(a.number).padStart(3, "0")}** — ${a.title} (\`${a.status}\`) — \`${a.path}\``
    )
    .join("\n");
}
