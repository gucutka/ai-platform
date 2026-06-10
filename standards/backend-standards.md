# Backend Standards

## Structure
- `src/` — application code
- `tests/` — mirrors src layout
- One module per domain boundary

## Code
- Explicit return types on exported functions
- Validate all external input (DTO / zod / class-validator)
- Use existing logger — no raw console in production paths
- Async errors propagated to HTTP layer

## HTTP
- Correct status: 201 create, 204 delete, 404 not found
- Consistent error body `{ error: string, code?: string }`

## Dependencies
- No new npm package without plan task approval

## References
Implement agents MUST cite these rules in self-review.
