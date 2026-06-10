import fs from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import type { FileSnippet } from "./types.js";

const IMPORT_PATTERNS = [
  /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+['"]([^'"]+)['"]/g,
];

const CODE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveImport(fromFile: string, spec: string, projectDir: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(projectDir, path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...CODE_EXT.map((e) => base + e),
    ...CODE_EXT.map((e) => path.join(base, "index" + e)),
  ];
  for (const c of candidates) {
    const rel = path.relative(projectDir, c);
    if (!rel.startsWith("..") && fs.existsSync(c) && fs.statSync(c).isFile()) {
      return rel.split(path.sep).join("/");
    }
  }
  return null;
}

/** Expand file set with direct local imports from seed files (one hop). */
export function expandWithImportNeighbors(
  projectDir: string,
  seeds: string[],
  allowedPaths: string[],
  maxExtra = 8
): string[] {
  const found = new Set<string>(seeds);
  const extra: string[] = [];

  for (const seed of seeds) {
    const full = path.join(projectDir, seed);
    if (!fs.existsSync(full)) continue;
    let content: string;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    for (const re of IMPORT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const resolved = resolveImport(seed, m[1], projectDir);
        if (!resolved || found.has(resolved)) continue;
        if (!isAllowed(resolved, allowedPaths)) continue;
        found.add(resolved);
        extra.push(resolved);
        if (extra.length >= maxExtra) return extra;
      }
    }
  }
  return extra;
}

function isAllowed(filePath: string, allowed: string[]): boolean {
  return allowed.some((pat) => minimatch(filePath, pat, { dot: true }));
}

export function readFileSnippet(
  projectDir: string,
  rel: string,
  maxBytes: number
): FileSnippet | null {
  const full = path.join(projectDir, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  let content = fs.readFileSync(full, "utf8");
  if (content.length > maxBytes) {
    content = content.slice(0, maxBytes) + "\n/* ... truncated */";
  }
  return { path: rel, content };
}
