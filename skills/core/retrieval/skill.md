---
name: retrieval
description: Context Builder file/knowledge selection without vector DB.
production_grade: true
---

# Retrieval

## Purpose
Context Builder file/knowledge selection without vector DB.

## When To Use
context-builder-agent

## When Not To Use
Agents doing direct retrieval

## Architecture Rules
Scope by project_id; respect allowed_paths

## Coding Rules
Top-K by stage tier; prefer plan file hints

## Patterns
Issue + manifest + glob code files

## Anti Patterns
Whole repo dump

## Examples
Max 12 files, 12KB each

## Edge Cases
Missing manifest

## Testing Expectations
N/A

## Review Criteria
Relevant files only

## Escalation Rules
Cross-client leakage → block
