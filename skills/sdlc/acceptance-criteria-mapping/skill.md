---
name: acceptance-criteria-mapping
description: Map AC to tests and implementation tasks.
production_grade: true
---

# AC mapping

## Purpose
Map AC to tests and implementation tasks.

## When To Use
product-spec-agent, qa-agent, test-agent

## When Not To Use
Unrelated agents

## Architecture Rules
Each AC has ID; mapped to tasks/tests

## Coding Rules
acceptance_criteria_mapped: true

## Patterns
Table AC → task → test

## Anti Patterns
AC in prose only

## Examples
Single AC ok for bugs

## Edge Cases
Orphan AC without task

## Testing Expectations
N/A

## Review Criteria
qa verifies array

## Escalation Rules
AC not testable
