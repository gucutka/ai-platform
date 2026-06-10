import type { AgentModule } from "./types.js";

export const securityAgent: AgentModule = {
  agentId: "security-agent",
  outputContract: "SecurityReport",
  skillIds: { sdlc: ["security-review"] },
  buildOutputInstructions: () => `
Emit SecurityReport@1.0:
- pr_number (integer, required)
- verdict: PASS | FAIL only
- summary: string (required)
- findings: [{ id, severity, title, file, line, message, category: "security", source }]

Incorporate SastScanResult findings from upstream contracts when present.
FAIL on any **critical** severity finding (including npm audit / pattern scan).
High severity alone → PASS with findings unless manifest client_tier is regulated (then FAIL).

Example:
\`\`\`ai-platform-contract
{
  "contract": "SecurityReport",
  "version": "1.0",
  "pr_number": 1,
  "verdict": "PASS",
  "summary": "No critical vulnerabilities; 1 medium npm advisory noted.",
  "findings": []
}
\`\`\`
`,
  normalizeOutput(data) {
    const out = { ...data };
    const verdict = String(out.verdict ?? "").toUpperCase();
    if (verdict) out.verdict = verdict;
    if (!Array.isArray(out.findings)) out.findings = [];
    if (typeof out.summary !== "string" || !out.summary.trim()) {
      const findings = out.findings as { severity?: string }[];
      const critical = findings.filter(
        (f) => String(f.severity ?? "").toLowerCase() === "critical"
      ).length;
      out.summary =
        verdict === "FAIL"
          ? `Security scan failed (${critical} critical finding(s)).`
          : findings.length
            ? `Security scan passed with ${findings.length} non-critical finding(s).`
            : "Security scan passed: no findings.";
    }
    return out;
  },
  validateOutput(data) {
    const errs: string[] = [];
    const v = String(data.verdict ?? "");
    if (v !== "PASS" && v !== "FAIL") errs.push("verdict must be PASS or FAIL");
    if (!(data.summary as string)?.length) errs.push("summary required");
    if (data.pr_number == null) errs.push("pr_number required");
    if (v === "FAIL") {
      const findings = data.findings as { severity?: string }[];
      if (!findings?.length) errs.push("FAIL requires findings");
    }
    return errs;
  },
};
