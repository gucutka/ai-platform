---
name: knowledge-layer-access
description: Business, Product, Technical layer boundaries.
production_grade: true
---

# Knowledge layer access

## Purpose
Business, Product, Technical layer boundaries.

## When To Use
Draft agents reading knowledge

## When Not To Use
Agents writing canonical knowledge

## Architecture Rules
BA owns business/; PA product/; Architect technical/

## Coding Rules
Read only via ContextPack

## Patterns
Reference ADR from technical layer

## Anti Patterns
Write to docs/knowledge without approval

## Examples
Layer-appropriate snippets only

## Edge Cases
Mixing client layers

## Testing Expectations
N/A

## Review Criteria
Correct layer cited

## Escalation Rules
Conflict → escalate per ownership model
