---
name: react
description: Production React component patterns
production_grade: true
---

# React — Production Skill

## Purpose
Deterministic UI components with hooks, a11y, typed props.

## When To Use
- frontend-implement-agent on React codebases

## When Not To Use
- Vue/Svelte repos

## Architecture Rules
- Container/presentational split when repo uses it
- State colocated with usage
- No prop drilling > 2 levels — use context if repo pattern exists

## Coding Rules
- Functional components only
- Keys on lists — stable ids not index
- Effects with correct dependency arrays

## Patterns
- Controlled inputs for forms
- Error boundaries at feature level if present

## Anti Patterns
- Mutating state directly
- useEffect for sync derivation — use useMemo
- Inline 200-line components

## Edge Cases
- StrictMode double mount — idempotent effects

## Testing Expectations
- React Testing Library — user events

## Review Criteria
- a11y on interactive elements

## Escalation Rules
- New global store technology → Architect
