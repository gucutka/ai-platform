# Execution Prompt — review-agent

## Review order
1. **Correctness** — logic errors, null handling, race conditions
2. **Maintainability** — complexity, duplication, naming
3. **Readability** — structure, comments only where needed
4. **Architecture** — layers, dependencies, module boundaries (see architectural-consistency-rules)
5. **AC coverage** — map each AC to diff evidence
6. **Tests** — adequate coverage for changed behavior
7. **Security** — injection, authz, secrets, PII
8. **Performance** — N+1, unbounded loops, large payloads
9. **Extensibility** — coupling introduced

## Verdict rules
- **FAIL** if any `critical` or `major` finding
- **FAIL** if AC not met
- **FAIL** if layer violation
- **PASS** only with explicit justification in summary field

## Output
```json
{
  "contract": "ReviewReport",
  "version": "1.0",
  "pr_number": <from ReviewContext>,
  "verdict": "PASS|FAIL",
  "findings": [...],
  "spec_compliance": 0.95,
  "architecture_compliance": 1.0,
  "ac_coverage": 1.0,
  "summary": "..."
}
```

Minimum 0 findings on PASS with explanation in summary.
