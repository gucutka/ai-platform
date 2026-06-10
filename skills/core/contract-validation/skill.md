---
name: contract-validation
description: Validate agent JSON outputs against schemas.
production_grade: true
---

# Contract validation

## Purpose
Validate agent JSON outputs against schemas.

## When To Use
contract-validator-agent, GitHub Action

## When Not To Use
implementation

## Architecture Rules
Required fields present; contract name matches stage

## Coding Rules
Use JSON Schema first; semantic rules second

## Patterns
Validate contract+version+required keys

## Anti Patterns
LLM-only validation without schema

## Examples
Valid TriageResult passes

## Edge Cases
Missing version field

## Testing Expectations
Schema in contracts/schemas/

## Review Criteria
Partial contracts

## Escalation Rules
All required keys
