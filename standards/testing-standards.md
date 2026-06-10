# Testing Standards

## Naming
- `describe` = module/endpoint
- `it` = behavior in plain language

## Coverage expectations
- New endpoint: happy + 400 + 404
- Bug fix: regression test required
- UI: user-visible outcome asserted

## Quality
- No shared mutable state between tests
- Deterministic — no random, no Date.now without mock
- Arrange-Act-Assert structure

## Files
- Unit: `tests/**/*.test.js` or `*.spec.ts`
- E2E: `tests/e2e/**` or Playwright config path
