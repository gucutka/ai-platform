---
name: code-review
description: Production code review for review-agent
production_grade: true
---

# Code Review — Production Skill

## Purpose
Structured, evidence-based PR review.

## When To Use
- review-agent always

## When Not To Use
- implement agents (they self-review only)

## Architecture Rules
Apply `architectural-consistency-rules.md` — any violation → FAIL.

## Coding Rules
- Findings must have file + line
- Severity proportional to impact

## Patterns
- Start from AC traceability matrix
- Then security, then architecture, then style

## Anti Patterns
- PASS with "LGTM"
- Findings without location
- Nitpicking 20 style issues as FAIL alone

## Edge Cases
- Large PR — prioritize changed files in diff

## Testing Expectations
- Flag missing tests on behavior change

## Review Criteria
See `frameworks/review-excellence.md`

## Escalation Rules
- critical security → Security Owner
