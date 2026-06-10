import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getPlatformRoot } from "./config.js";
import { loadRuntimeDef } from "./agents.js";

export interface CompatibilityMatrix {
  version: string;
  platform_version: string;
  contract_versions: string[];
  agents: Record<string, { inputs: string[] }>;
}

let cached: CompatibilityMatrix | null = null;

export function loadCompatibilityMatrix(): CompatibilityMatrix {
  if (cached) return cached;
  const file = path.join(getPlatformRoot(), "contracts/compatibility-matrix.yaml");
  cached = YAML.parse(fs.readFileSync(file, "utf8")) as CompatibilityMatrix;
  return cached;
}

export function contractRefToName(ref: string): string {
  return ref.split("@")[0].trim();
}

export function checkAgentInputContracts(
  agentId: string,
  issueNumber: number,
  loadContract: (issue: number, name: string) => Record<string, unknown>,
  opts?: { requireArchitectureReview?: boolean }
): { ok: boolean; missing: string[] } {
  let required: string[];
  try {
    const def = loadRuntimeDef(agentId);
    required = def.input_contracts ?? [];
  } catch {
    const matrix = loadCompatibilityMatrix();
    required = matrix.agents[agentId]?.inputs ?? [];
  }

  const missing: string[] = [];
  for (const ref of required) {
    const name = contractRefToName(ref);
    const version = ref.split("@")[1] ?? "1.0";
    const data = loadContract(issueNumber, name);
    if (!data?.contract) {
      missing.push(ref);
      continue;
    }
    if (String(data.version ?? "1.0") !== version) {
      missing.push(`${ref} (version mismatch: ${data.version})`);
    }
  }

  if (agentId === "plan-agent") {
    const wd = loadContract(issueNumber, "WorkflowDecision");
    const risk = String(wd.risk_level ?? "low").toLowerCase();
    if (risk === "medium" || risk === "high") {
      for (const spec of [
        "BusinessRequirements@1.0",
        "ProductSpec@1.0",
        "TechnicalDesign@1.0",
      ]) {
        const name = contractRefToName(spec);
        const data = loadContract(issueNumber, name);
        if (!data?.contract) {
          missing.push(`${spec} (required for ${risk} path)`);
        }
      }
    }
  }

  if (agentId === "review-agent" && opts?.requireArchitectureReview) {
    const arch = loadContract(issueNumber, "ArchitectureReviewReport");
    if (!arch?.contract) {
      missing.push("ArchitectureReviewReport@1.0 (required before review-agent)");
    } else if (String(arch.verdict ?? "").toUpperCase() !== "PASS") {
      missing.push(
        `ArchitectureReviewReport@1.0 verdict must be PASS (got ${arch.verdict})`
      );
    }
  }

  if (agentId === "security-agent") {
    const review = loadContract(issueNumber, "ReviewReport");
    if (!review?.contract) {
      missing.push("ReviewReport@1.0 (required before security-agent)");
    } else if (String(review.verdict ?? "").toUpperCase() !== "PASS") {
      missing.push("ReviewReport@1.0 verdict must be PASS before security-agent");
    }
  }

  if (agentId === "docs-agent") {
    const merge = loadContract(issueNumber, "MergeRecord");
    if (!merge?.contract) {
      missing.push("MergeRecord@1.0 (required before docs-agent)");
    }
  }

  if (agentId === "release-agent") {
    const doc = loadContract(issueNumber, "DocumentationResult");
    if (!doc?.contract) {
      missing.push("DocumentationResult@1.0 (required before release-agent)");
    }
  }

  return { ok: missing.length === 0, missing };
}
