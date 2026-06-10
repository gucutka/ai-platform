import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import ajvFormats from "ajv-formats";
import { getPlatformRoot } from "./config.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateSchema: false,
});
const applyFormats = ajvFormats as unknown as (instance: Ajv2020) => Ajv2020;
applyFormats(ajv);

const compiled = new Map<string, ValidateFunction>();

function resolveSchemaPath(name: string): string | null {
  const primary = path.join(getPlatformRoot(), "contracts/schemas", `${name}.v1.json`);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(getPlatformRoot(), "runtime/config/contracts", `${name}.v1.json`);
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function getValidator(name: string) {
  if (compiled.has(name)) return compiled.get(name)!;
  const file = resolveSchemaPath(name);
  if (!file) return null;
  const schema = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const validate = ajv.compile(schema);
  compiled.set(name, validate);
  return validate;
}

export function validateWithSchema(
  contractName: string,
  data: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const validate = getValidator(contractName);
  if (!validate) {
    return { valid: true, errors: [] };
  }

  const ok = validate(data);
  if (ok) return { valid: true, errors: [] };

  const errors = (validate.errors ?? []).map((e: ErrorObject) => {
    const loc = e.instancePath || "/";
    return `${loc} ${e.message ?? "invalid"}`.trim();
  });
  return { valid: false, errors };
}
