---
name: escalation-protocols
description: When to stop and involve humans.
production_grade: true
---

# Escalation protocols

## Purpose
When to stop and involve humans.

## When To Use
Any agent on ambiguity

## When Not To Use
Never escalate

## Architecture Rules
Set escalation_recommended: true; label agent-route:blocked

## Coding Rules
SLA per policies/escalation-rules.yaml

## Patterns
Document reason in contract

## Anti Patterns
Continue with guesses

## Examples
Missing AC → BA; arch conflict → Architect

## Edge Cases
Budget exceeded → EM

## Testing Expectations
N/A

## Review Criteria
Escalation fields set

## Escalation Rules
Silent failure
