---
name: terraform
description: IaC modules and state.
production_grade: true
---

# Terraform

## Purpose
IaC modules and state.

## When To Use
infra-implement-agent

## When Not To Use
App code

## Architecture Rules
Module per concern; no hardcoded env

## Coding Rules
variables.tf for config; outputs documented

## Patterns
plan-only mindset; small diffs

## Anti Patterns
Manual console changes

## Examples
Rename unrelated resources

## Edge Cases
State lock awareness

## Testing Expectations
N/A

## Review Criteria
terraform validate

## Escalation Rules
Drift
