---
name: impact-analysis
description: Dependency and blast radius analysis.
production_grade: true
---

# Impact analysis

## Purpose
Dependency and blast radius analysis.

## When To Use
product-spec-agent

## When Not To Use
Triage

## Architecture Rules
List affected modules, APIs, consumers

## Coding Rules
Dependency map updates

## Patterns
Risk score for cross-cutting

## Anti Patterns
Skip impact on large features

## Examples
Single file typo

## Edge Cases
Unknown dependency → flag

## Testing Expectations
N/A

## Review Criteria
Deps listed

## Escalation Rules
Hidden coupling
