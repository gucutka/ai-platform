import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClientProject } from "../dist/create-client-project.js";

describe("createClientProject", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-client-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("scaffolds infra skeleton with manifest and workflows", () => {
    const platformRoot = path.resolve(import.meta.dirname, "../..");
    const result = createClientProject({
      targetDir: tmp,
      projectId: "b2b-todo-saas",
      platformOwner: "test-org",
      platformRoot,
    });

    expect(result.project_id).toBe("b2b-todo-saas");
    expect(result.platform_repository).toBe("test-org/ai-platform");
    expect(fs.existsSync(path.join(tmp, ".ai-platform/manifest.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".github/workflows/issue-routing.yml"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".github/workflows/channel-events.yml"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".github/ISSUE_TEMPLATE/feature.yml"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "docs/knowledge/business/README.md"))).toBe(true);

    const manifest = fs.readFileSync(path.join(tmp, ".ai-platform/manifest.yaml"), "utf8");
    expect(manifest).toContain("project_id: b2b-todo-saas");
    expect(manifest).not.toContain("CHANGE_ME");

    const routing = fs.readFileSync(path.join(tmp, ".github/workflows/issue-routing.yml"), "utf8");
    expect(routing).not.toContain("YOUR_ORG");
    expect(routing).toContain("github.repository_owner");
  });
});
