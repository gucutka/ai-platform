import type { AgentModule } from "./types.js";

export const qaAgent: AgentModule = {
  agentId: "qa-agent",
  outputContract: "VerificationResult",
  skillIds: {
    sdlc: ["test-generation", "acceptance-criteria-mapping"],
    technology: ["playwright", "jest"],
  },
  buildOutputInstructions: () => `
Emit VerificationResult@1.0:
- pr_number, acceptance_criteria_verified: boolean[] (all true for ready_for_merge)
- tests_added, tests: [{ path, content }] with FULL test file content
- edge_cases_covered: true, regression_risk: low|medium|high
- ready_for_merge: boolean
`,
  validateOutput(data) {
    const errs: string[] = [];
    if (data.ready_for_merge === true) {
      const ac = data.acceptance_criteria_verified as boolean[];
      if (ac?.some((x) => !x)) errs.push("ready_for_merge but AC not all true");
    }
    return errs;
  },
};
