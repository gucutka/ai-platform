---
name: postgres
description: SQL schema and migrations.
production_grade: true
---

# PostgreSQL

## Purpose
SQL schema and migrations.

## When To Use
backend-implement-agent

## When Not To Use
Mongo tasks

## Architecture Rules
Migrations reversible when possible

## Coding Rules
Indexes for FK lookups

## Patterns
Parameterized queries only

## Anti Patterns
String concat SQL

## Examples
Migration without plan

## Edge Cases
Lock timeout on big migration

## Testing Expectations
N/A

## Review Criteria
Migration test

## Escalation Rules
Data loss risk
