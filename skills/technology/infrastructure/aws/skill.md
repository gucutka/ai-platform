---
name: aws
description: AWS service patterns.
production_grade: true
---

# AWS

## Purpose
AWS service patterns.

## When To Use
infra-implement-agent

## When Not To Use
Local dev

## Architecture Rules
Least privilege IAM

## Coding Rules
Use existing modules/VPC refs

## Patterns
Tag resources per client policy

## Anti Patterns
Access keys in code

## Examples
New account setup

## Edge Cases
Region consistency

## Testing Expectations
N/A

## Review Criteria
IAM policy review

## Escalation Rules
Public S3 bucket
