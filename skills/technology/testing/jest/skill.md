---
name: jest
description: Jest unit tests.
production_grade: true
---

# Jest

## Purpose
Jest unit tests.

## When To Use
qa-agent, frontend

## When Not To Use
E2E-only

## Architecture Rules
describe/it structure

## Coding Rules
mock external IO

## Patterns
expect assertions specific

## Anti Patterns
jest.fn() without assertions

## Examples
Snapshot-only tests

## Edge Cases
Flaky timers

## Testing Expectations
N/A

## Review Criteria
npm test passes

## Escalation Rules
False green
