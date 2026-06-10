/**
 * Auto-load runtime/.env into process.env on CLI startup.
 *
 * - No dependency (dotenv not needed); handles quoted values and `export ` prefixes.
 * - Shell environment wins: existing variables are never overridden.
 * - Looked up relative to this module (runtime/.env), so it works from any cwd.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const noExport = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const eq = noExport.indexOf("=");
  if (eq <= 0) return null;
  const key = noExport.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = noExport.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  } else {
    // strip trailing inline comment on unquoted values
    const hash = value.indexOf(" #");
    if (hash >= 0) value = value.slice(0, hash).trimEnd();
  }
  return [key, value];
}

export function loadEnvFile(filePath?: string): string[] {
  const envPath = filePath ?? path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return [];
  const loaded: string[] = [];
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] !== undefined) continue; // shell wins
    process.env[key] = value;
    loaded.push(key);
  }
  return loaded;
}

loadEnvFile();
