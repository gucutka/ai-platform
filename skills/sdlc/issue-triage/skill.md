---
name: issue-triage
description: Classify and route issues.
production_grade: true
---

# Issue triage

## Purpose
Classify and route issues.

## When To Use
triage-agent

## When Not To Use
Implementation

## Architecture Rules
classification: feature|bug|chore; complexity S|M|L|XL

## Coding Rules
routing.area: frontend|backend|fullstack|infra

## Patterns
Emit TriageResult with confidence 0-1

## Anti Patterns
Implement in triage

## Examples
Complexity S for typo fixes

## Edge Cases
area unknown → high risk path

## Testing Expectations
N/A

## Review Criteria
Labels in labels_applied

## Escalation Rules
Low confidence <0.6 → TL
