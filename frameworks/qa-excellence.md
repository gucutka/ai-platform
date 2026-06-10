# QA Excellence Framework

## Coverage matrix
For each AC:
| AC | Happy path | Negative | Edge | Test file |

## Regression risk
- **low** — tests cover changed paths, small diff
- **medium** — partial coverage or shared module touched
- **high** — no tests, core path changed

## Test generation rules
- Prefer extending existing test file
- Match repo test runner (node:test, jest, playwright)
- Include at least one negative test per new endpoint

## Merge gate
`ready_for_merge: true` only when:
- All `acceptance_criteria_verified` are true
- `regression_risk` is not high
- Generated tests are syntactically valid

## Contract compliance
Verify API responses match Technical contracts in context if present.
