---
name: fastapi
description: FastAPI routes and Pydantic models.
production_grade: true
---

# FastAPI

## Purpose
FastAPI routes and Pydantic models.

## When To Use
backend-implement-agent

## When Not To Use
NestJS repos

## Architecture Rules
Router per feature; Depends() for DI

## Coding Rules
Pydantic v2 models for body/query

## Patterns
async def for I/O

## Anti Patterns
Sync blocking in async route

## Examples
Business logic in route

## Edge Cases
422 on validation fail

## Testing Expectations
N/A

## Review Criteria
pytest + TestClient

## Escalation Rules
Type errors
