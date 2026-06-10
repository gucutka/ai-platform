import type { AgentModule } from "./types.js";

export const reviewAgent: AgentModule = {
  agentId: "review-agent",
  outputContract: "ReviewReport",
  skillIds: { sdlc: ["code-review"] },
  buildOutputInstructions: () => `
Emit ReviewReport@1.0:
- pr_number, verdict: PASS|FAIL only
- summary: string (required — one sentence justification for the verdict)
- findings: [{ severity, file, line, message, category }]
- spec_compliance, architecture_compliance, ac_coverage (0-1)
FAIL if any critical/major or AC miss.
FAIL if VerificationResult.ready_for_merge is false or ci_status is not "passed".
Every FAIL finding MUST have file and line.

Example:
\`\`\`ai-platform-contract
{
  "contract": "ReviewReport",
  "version": "1.0",
  "pr_number": 1,
  "verdict": "PASS",
  "summary": "Implementation matches AC; only style notes remain.",
  "findings": [],
  "spec_compliance": 1
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    const verdict = String(out.verdict ?? "").toUpperCase();
    if (verdict) out.verdict = verdict;
    if (!Array.isArray(out.findings)) out.findings = [];

    if (typeof out.summary !== "string" || !out.summary.trim()) {
      const findings = out.findings as { severity?: string; message?: string }[];
      if (verdict === "FAIL") {
        out.summary = "Review failed: see findings.";
      } else if (findings.length === 0) {
        out.summary = "Review passed: no issues found.";
      } else {
        const note = findings
          .slice(0, 2)
          .map((f) => f.message)
          .filter(Boolean)
          .join("; ");
        out.summary = `Review passed with ${findings.length} informational finding(s)${note ? `: ${note}` : "."}`;
      }
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    const v = String(data.verdict);
    if (v !== "PASS" && v !== "FAIL") errs.push("verdict must be PASS or FAIL");
    if (v === "FAIL") {
      const findings = data.findings as { file?: string; line?: number }[];
      if (!findings?.length) errs.push("FAIL requires findings");
      for (const f of findings ?? []) {
        if (!f.file) errs.push("finding missing file");
      }
    }
    if (v === "PASS" && !(data.summary as string)?.length) errs.push("PASS requires summary");
    return errs;
  },
};
