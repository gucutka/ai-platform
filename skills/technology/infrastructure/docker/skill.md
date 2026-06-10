---
name: docker
description: Container images and compose.
production_grade: true
---

# Docker

## Purpose
Container images and compose.

## When To Use
infra-implement-agent

## When Not To Use
K8s unless in plan

## Architecture Rules
Multi-stage builds; non-root user

## Coding Rules
Pin base image digests when repo does

## Patterns
.dockerignore respected

## Anti Patterns
Latest tag only

## Examples
Secrets in ENV in Dockerfile

## Edge Cases
Layer cache busting

## Testing Expectations
N/A

## Review Criteria
Image scans

## Escalation Rules
Root user
