---
name: test-generation
description: Production test generation for qa-agent
production_grade: true
---

# Test Generation — Production Skill

## Purpose
Generate complete, runnable test files from AC.

## When To Use
- qa-agent

## When Not To Use
- review-agent (review only)

## Architecture Rules
- Tests in `tests/**` mirror source layout
- No production code in test files except test helpers

## Coding Rules
- One assert focus per test where possible
- Descriptive `it` strings from AC text

## Patterns
```javascript
it('returns 404 when todo does not exist', async () => {
  const res = await request(app).delete('/api/todos/999');
  assert.equal(res.status, 404);
});
```

## Anti Patterns
- Tests that mock the system under test entirely
- Asserting implementation details

## Edge Cases
- Async errors — assert rejection/status

## Testing Expectations
- Include negative and boundary tests

## Review Criteria
- Tests executable with repo `npm test`

## Escalation Rules
- No test runner — emit ready_for_merge false
