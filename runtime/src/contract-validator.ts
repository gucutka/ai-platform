import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  bulletList,
  formatContractDetails,
  humanAgentName,
  machineMarker,
} from "./comment-format.js";
import { getPlatformRoot } from "./config.js";
import { validateWithSchema } from "./schema-validator.js";

export interface ValidationResultRecord {
  contract: "ValidationResult";
  version: "1.0";
  issue_id: number;
  target_contract: string;
  agent_id: string;
  valid: boolean;
  errors: string[];
  semantic_errors: string[];
  validated_by: "contract-validator-agent";
}

interface SemanticRule {
  contract: string;
  check: string;
}

function loadSemanticRules(): SemanticRule[] {
  const file = path.join(getPlatformRoot(), "contracts/rules/validation-rules.yaml");
  if (!fs.existsSync(file)) return [];
  const raw = YAML.parse(fs.readFileSync(file, "utf8")) as {
    semantic?: { rules?: SemanticRule[] };
  };
  return raw.semantic?.rules ?? [];
}

function runSemanticChecks(
  contractName: string,
  data: Record<string, unknown>
): string[] {
  const rules = loadSemanticRules().filter((r) => r.contract === contractName);
  const errors: string[] = [];

  for (const rule of rules) {
    switch (rule.check) {
      case "acceptance_criteria_mapped_must_be_true_for_approval": {
        if (data.acceptance_criteria_mapped !== true) {
          errors.push("ProductSpec: acceptance_criteria_mapped must be true");
        }
        break;
      }
      case "verdict_block_prevents_review_agent": {
        if (String(data.verdict ?? "").toUpperCase() === "BLOCK") {
          errors.push("ArchitectureReviewReport: BLOCK verdict blocks downstream review");
        }
        break;
      }
      case "ready_for_merge_requires_all_ac_true": {
        if (data.ready_for_merge === true) {
          const ac = data.acceptance_criteria as Record<string, boolean> | undefined;
          if (ac && Object.values(ac).some((v) => v !== true)) {
            errors.push("VerificationResult: ready_for_merge requires all AC true");
          }
        }
        break;
      }
    }
  }

  return errors;
}

export function runContractValidation(opts: {
  agentId: string;
  issueId: number;
  contractName: string;
  data: Record<string, unknown>;
}): ValidationResultRecord {
  const schema = validateWithSchema(opts.contractName, opts.data);
  const semantic = runSemanticChecks(opts.contractName, opts.data);
  const errors = [...schema.errors];
  const semantic_errors = semantic;

  return {
    contract: "ValidationResult",
    version: "1.0",
    issue_id: opts.issueId,
    target_contract: opts.contractName,
    agent_id: opts.agentId,
    valid: schema.valid && semantic_errors.length === 0,
    errors,
    semantic_errors,
    validated_by: "contract-validator-agent",
  };
}

export function formatValidationFailureComment(result: ValidationResultRecord): string {
  const all = [...result.errors, ...result.semantic_errors];
  return [
    machineMarker("validation-failed"),
    `## Contract validation failed`,
    `**Agent:** ${humanAgentName(result.agent_id)} · **Contract:** \`${result.target_contract}\``,
    "",
    "Output did not pass schema or semantic checks. The contract was **not** published to this issue.",
    "",
    `### Errors\n\n${bulletList(all)}`,
    formatContractDetails("ValidationResult@1.0", result as unknown as Record<string, unknown>),
  ].join("\n");
}
