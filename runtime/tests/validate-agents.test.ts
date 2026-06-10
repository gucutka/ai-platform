import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgents } from "../dist/validate-agents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = path.resolve(__dirname, "../..");

describe("validateAgents (repo invariant)", () => {
  const report = validateAgents(PLATFORM_ROOT);

  it("repo agent layers are consistent (no errors)", () => {
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("has no drift warnings", () => {
    expect(report.warnings).toEqual([]);
  });

  it("covers the full catalog and registry", () => {
    expect(report.checked.catalog_agents).toBe(15);
    expect(report.checked.registry_agents).toBe(20);
  });
});
