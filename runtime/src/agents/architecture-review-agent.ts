import type { AgentModule } from "./types.js";

export const architectureReviewAgent: AgentModule = {
  agentId: "architecture-review-agent",
  outputContract: "ArchitectureReviewReport",
  skillIds: { sdlc: ["technical-design-format"] },
  buildOutputInstructions: () => `
Emit ArchitectureReviewReport@1.0:
- pr_number (integer, required)
- verdict: PASS | FAIL | BLOCK
- summary: string (required — one sentence)
- findings: [{ severity, file, line, message, category }]
- adr_compliance (0-1)

Check PR diff against TechnicalDesign and architectural-consistency-rules.
PASS when no layer/boundary/ADR violations.
FAIL or BLOCK when violations found — BLOCK for ADR contradictions.
Every FAIL/BLOCK finding MUST include file and line when applicable.

Example:
\`\`\`ai-platform-contract
{
  "contract": "ArchitectureReviewReport",
  "version": "1.0",
  "pr_number": 1,
  "verdict": "PASS",
  "summary": "Changes align with TechnicalDesign and layer boundaries.",
  "findings": [],
  "adr_compliance": 1
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    const verdict = String(out.verdict ?? "").toUpperCase();
    if (verdict) out.verdict = verdict;
    if (!Array.isArray(out.findings)) out.findings = [];
    if (typeof out.summary !== "string" || !out.summary.trim()) {
      const findings = out.findings as { message?: string }[];
      if (verdict === "PASS") {
        out.summary = "Architecture review passed: no violations found.";
      } else {
        out.summary = findings[0]?.message ?? "Architecture review failed.";
      }
    }
    if (typeof out.adr_compliance !== "number") {
      out.adr_compliance = verdict === "PASS" ? 1 : 0;
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    const v = String(data.verdict ?? "").toUpperCase();
    if (!["PASS", "FAIL", "BLOCK"].includes(v)) {
      errs.push("verdict must be PASS, FAIL, or BLOCK");
    }
    if (!(data.summary as string)?.length) errs.push("summary required");
    if (v !== "PASS") {
      const findings = data.findings as { file?: string }[];
      if (!findings?.length) errs.push("FAIL/BLOCK requires findings");
    }
    if (data.pr_number == null) errs.push("pr_number required");
    return errs;
  },
};
