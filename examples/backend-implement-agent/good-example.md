# Good Example — backend-implement-agent

## Task
Add DELETE `/api/todos/:id` returning 404 if missing.

## Excellent CodeChanges excerpt
- Single file `src/server.js` modified
- Validates id, uses existing array find
- Returns 404 JSON `{ error: "not found" }`
- `plan_task_coverage: 1.0`
- `self_review_passed: true`

## Why good
Minimal scope, matches plan, no new dependencies, error handling present.
