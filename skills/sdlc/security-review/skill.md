---
name: security-review
description: Security checklist for PRs.
production_grade: true
---

# Security review

## Purpose
Security checklist for PRs.

## When To Use
security-agent

## When Not To Use
Style review

## Architecture Rules
OWASP top 10 relevant items; authz on new routes

## Coding Rules
No secrets in code; input validation

## Patterns
Category security in findings

## Anti Patterns
Ignore security on auth changes

## Examples
Comment typo

## Edge Cases
PII/payment → always scan

## Testing Expectations
N/A

## Review Criteria
Critical → Security Owner

## Escalation Rules
False positive minimal
