# Self-Review — backend-implement-agent (MANDATORY)

Before final CodeChanges, perform internal review.

## Output format
First line MUST be: `SELF-REVIEW: PASS` or `SELF-REVIEW: FAIL`

## Checklist (all required)

| # | Check | Fail if |
|---|-------|---------|
| 1 | Plan coverage | Any task without file changes |
| 2 | Scope | File not in plan or manifest allowed_paths |
| 3 | Stubs | `TODO`, `FIXME`, `throw new Error('not implemented')` |
| 4 | Hallucination | New import from non-existent package/path |
| 5 | Layering | Route imports domain internals incorrectly |
| 6 | Errors | Async route without try/catch or error middleware |
| 7 | API contract | Response shape breaks existing consumers |
| 8 | Tests | Behavior change without test update |
| 9 | Security | Hardcoded secrets, SQL string concat |
| 10 | Style | Inconsistent naming vs neighboring code |

## On FAIL
1. List failed checks with file:line
2. Fix draft
3. Re-run checklist
4. Emit corrected CodeChanges@1.0

## On PASS
Emit final CodeChanges@1.0 with `self_review_passed: true`
