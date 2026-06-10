import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "../dist/load-env.js";

const KEYS = [
  "T_PLAIN",
  "T_EXPORTED",
  "T_DQUOTED",
  "T_SQUOTED",
  "T_INLINE",
  "T_SHELL_WINS",
] as const;

function writeTmpEnv(content: string): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "envtest-")), ".env");
  fs.writeFileSync(p, content);
  return p;
}

describe("loadEnvFile", () => {
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("parses plain, exported, quoted and inline-commented values", () => {
    const p = writeTmpEnv(
      [
        "# comment line",
        "T_PLAIN=plain",
        "export T_EXPORTED=fromexport",
        'T_DQUOTED="hello world/with spaces"',
        "T_SQUOTED='single quoted'",
        "T_INLINE=value # trailing comment",
        "",
        "NOT_A_LINE",
        "1BADKEY=x",
      ].join("\n")
    );
    const loaded = loadEnvFile(p);
    expect(process.env.T_PLAIN).toBe("plain");
    expect(process.env.T_EXPORTED).toBe("fromexport");
    expect(process.env.T_DQUOTED).toBe("hello world/with spaces");
    expect(process.env.T_SQUOTED).toBe("single quoted");
    expect(process.env.T_INLINE).toBe("value");
    expect(loaded).toContain("T_PLAIN");
    expect(loaded).not.toContain("1BADKEY");
  });

  it("never overrides variables already set in the shell", () => {
    process.env.T_SHELL_WINS = "shell";
    const p = writeTmpEnv("T_SHELL_WINS=file");
    const loaded = loadEnvFile(p);
    expect(process.env.T_SHELL_WINS).toBe("shell");
    expect(loaded).not.toContain("T_SHELL_WINS");
  });

  it("returns empty list for a missing file", () => {
    expect(loadEnvFile("/nonexistent/.env")).toEqual([]);
  });
});
