---
name: redis
description: Cache and session patterns.
production_grade: true
---

# Redis

## Purpose
Cache and session patterns.

## When To Use
backend-implement-agent

## When Not To Use
Primary DB

## Architecture Rules
TTL on cache keys

## Coding Rules
Key namespace per project

## Patterns
Cache aside pattern

## Anti Patterns
Redis as source of truth

## Examples
Unbounded keys

## Edge Cases
Session secret in key name

## Testing Expectations
N/A

## Review Criteria
Integration test mock

## Escalation Rules
Cache stampede
