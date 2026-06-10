---
name: implementation-planning
description: Deterministic implementation plans for plan-agent
production_grade: true
---

# Implementation Planning — Production Skill

## Purpose
Decompose work into ordered, file-scoped tasks for implement agents.

## When To Use
- plan-agent

## Architecture Rules
- Tasks align to module boundaries
- Separate frontend/backend tasks when stacks differ

## Coding Rules
Each task includes:
- `id`, `description`, `files[]`, `stack`, `order`
- `stack`: `frontend` | `backend` | `fullstack`

## Patterns
- branch_name: `feat/{issue_id}-{slug}`
- Max 5 tasks for complexity S, 10 for M

## Anti Patterns
- Vague tasks ("fix bug")
- Tasks without file paths

## Edge Cases
- Bug with single file — one task OK

## Testing Expectations
- Last task may be "add tests" when behavior changes

## Review Criteria
- plan-agent output consumed by implement without clarification

## Escalation Rules
- Cannot identify files → area:unknown in triage
