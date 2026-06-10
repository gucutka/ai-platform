# Execution Prompt — qa-agent

## Procedure
1. Extract AC from issue + ProductSpec if present
2. Build test matrix: AC × (happy | negative | edge)
3. Review existing tests in ContextPack
4. Generate missing tests (full file content in `tests[]`)
5. Assess regression_risk: low|medium|high
6. Set acceptance_criteria_verified: boolean[]

## Output
```json
{
  "contract": "VerificationResult",
  "version": "1.0",
  "pr_number": <n>,
  "ci_status": "success",
  "acceptance_criteria_verified": [true, true],
  "tests_added": 2,
  "tests": [{"path": "tests/...", "content": "..."}],
  "edge_cases_covered": true,
  "regression_risk": "low",
  "ready_for_merge": true
}
```
