---
name: playwright
description: Playwright E2E testing for qa-agent
production_grade: true
---

# Playwright — Production Skill

## Purpose
Reliable E2E tests for user-visible AC.

## When To Use
- qa-agent on web apps
- AC requiring full browser flow

## When Not To Use
- Pure API backends without UI

## Architecture Rules
- Page Object pattern if repo uses it
- Tests independent — no order dependency

## Coding Rules
- `await expect(locator).toBeVisible()`
- Use `data-testid` if repo convention
- No hard waits — use auto-waiting

## Anti Patterns
- sleep(5000)
- Shared browser state

## Edge Cases
- Flaky network — route intercept mock

## Testing Expectations
- Cover happy + one negative path per flow

## Review Criteria
- Tests run headless in CI

## Escalation Rules
- No playwright config in repo → suggest jest api tests
