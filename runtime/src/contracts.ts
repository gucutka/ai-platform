import fs from "node:fs";
import path from "node:path";
import { getPlatformRoot } from "./config.js";
import { validateWithSchema } from "./schema-validator.js";

function stripJsonComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripJsonComments(raw.trim());
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    try {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) return null;
      const fixed = cleaned
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(fixed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripJsonComments(raw.trim())) as Record<string, unknown>;
  } catch {
    return parseJsonObject(raw);
  }
}

function scoreContractCandidate(
  data: Record<string, unknown>,
  expectedName?: string
): number {
  let score = 0;
  if (typeof data.contract === "string") {
    score += 10;
    const name = data.contract.split("@")[0].trim();
    if (expectedName && name.toLowerCase() === expectedName.toLowerCase()) {
      score += 30;
    }
  }
  if (data.issue_id !== undefined) score += 5;
  if (data.classification !== undefined) score += 5;
  if (data.complexity !== undefined) score += 5;
  if (data.tasks !== undefined) score += 5;
  if (data.verdict !== undefined) score += 5;
  return score;
}

export function extractContract(
  text: string,
  expectedName?: string
): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];

  for (const m of text.matchAll(/```(?:ai-platform-contract|json)?\s*([\s\S]*?)```/gi)) {
    if (m[1]?.trim()) {
      const parsed = tryParseJson(m[1]);
      if (parsed) candidates.push(parsed);
    }
  }

  const whole = tryParseJson(text.trim());
  if (whole) candidates.push(whole);

  const sliced = parseJsonObject(text);
  if (sliced) candidates.push(sliced);

  if (!candidates.length) return null;

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = scoreContractCandidate(c, expectedName);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : candidates[0] ?? null;
}

export function loadContractToolSchema(name: string): Record<string, unknown> {
  const schemaPath = path.join(
    getPlatformRoot(),
    "contracts/schemas",
    `${name}.v1.json`
  );
  const configPath = path.join(
    getPlatformRoot(),
    "runtime/config/contracts",
    `${name}.v1.json`
  );
  const file = fs.existsSync(schemaPath)
    ? schemaPath
    : fs.existsSync(configPath)
      ? configPath
      : null;
  if (!file) {
    return {
      type: "object",
      properties: {
        contract: { type: "string", enum: [name] },
        version: { type: "string", enum: ["1.0"] },
        issue_id: { type: "number" },
      },
      required: ["contract", "version", "issue_id"],
    };
  }

  const schema = JSON.parse(fs.readFileSync(file, "utf8")) as {
    required?: string[];
    properties?: Record<string, Record<string, unknown>>;
  };

  const properties: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.const !== undefined) {
      properties[key] = {
        type: typeof prop.const === "number" ? "number" : "string",
        enum: [prop.const],
      };
      continue;
    }
    if (prop.type === "integer") {
      properties[key] = { type: "number" };
      continue;
    }
    if (prop.type === "object") {
      properties[key] = { type: "object", additionalProperties: true };
      continue;
    }
    if (prop.type === "array") {
      properties[key] = { type: "array", items: { type: "string" } };
      continue;
    }
    properties[key] = { type: prop.type ?? "string" };
  }

  if (name === "TriageResult") {
    properties.labels_applied = { type: "array", items: { type: "string" } };
    properties.escalation_recommended = { type: "boolean" };
  }

  if (name === "ReviewReport") {
    properties.summary = {
      type: "string",
      description: "One-sentence justification for PASS or FAIL",
    };
    properties.architecture_compliance = { type: "number" };
    properties.ac_coverage = { type: "number" };
    properties.findings = {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string" },
          file: { type: "string" },
          line: { type: "number" },
          message: { type: "string" },
          category: { type: "string" },
        },
      },
    };
  }

  const required = [...(schema.required ?? ["contract", "version", "issue_id"])];
  if (name === "ReviewReport" && !required.includes("summary")) {
    required.push("summary");
  }

  return {
    type: "object",
    properties,
    required,
  };
}

/** Coerce common model output quirks before schema validation. */
export function normalizeContract(
  data: Record<string, unknown>,
  expectedName: string,
  issueId?: number
): Record<string, unknown> {
  const out = { ...data };

  if (typeof out.contract === "string") {
    out.contract = out.contract.split("@")[0].trim();
  }
  if (!out.contract) out.contract = expectedName;

  if (out.version === 1 || out.version === 1.0) out.version = "1.0";
  else if (out.version === undefined || out.version === null) out.version = "1.0";
  else out.version = String(out.version);

  if (issueId !== undefined && (out.issue_id === undefined || out.issue_id === null)) {
    out.issue_id = issueId;
  }
  if (out.issue_id !== undefined && out.issue_id !== null) {
    const n = Number(out.issue_id);
    if (!Number.isNaN(n)) out.issue_id = Math.trunc(n);
  }

  if (!out.classification && typeof out.type === "string") {
    out.classification = out.type;
  }
  if (typeof out.classification === "string") {
    out.classification = out.classification.toLowerCase().trim();
  }

  const complexityMap: Record<string, string> = {
    small: "S",
    medium: "M",
    large: "L",
    xlarge: "XL",
    xl: "XL",
    s: "S",
    m: "M",
    l: "L",
  };
  if (typeof out.complexity === "string") {
    const key = out.complexity.toLowerCase().trim();
    out.complexity = complexityMap[key] ?? out.complexity.toUpperCase().trim();
  }

  if (typeof out.contract === "string") {
    const base = out.contract.split("@")[0].trim();
    if (base.toLowerCase() === expectedName.toLowerCase()) {
      out.contract = expectedName;
    }
  }

  return out;
}

export function validateContract(
  name: string,
  data: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  if (data.contract !== name) {
    return { valid: false, errors: [`Expected contract ${name}, got ${data.contract}`] };
  }
  if (data.version !== "1.0") {
    return { valid: false, errors: ["version must be 1.0"] };
  }

  const schemaPath = path.join(
    getPlatformRoot(),
    "contracts/schemas",
    `${name}.v1.json`
  );
  const configPath = path.join(
    getPlatformRoot(),
    "runtime/config/contracts",
    `${name}.v1.json`
  );
  const file = fs.existsSync(schemaPath)
    ? schemaPath
    : fs.existsSync(configPath)
      ? configPath
      : null;

  if (!file) return { valid: true };

  const ajvResult = validateWithSchema(name, data);
  if (!ajvResult.valid) {
    return { valid: false, errors: ajvResult.errors };
  }
  return { valid: true };
}

export { formatAgentContractComment as formatContractComment } from "./comment-format.js";

export function parseContractsFromComments(
  body: string
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const re = /```ai-platform-contract\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const c = extractContract(m[0]);
    if (c) results.push(c);
  }
  return results;
}
