---
name: nextjs
description: Next.js App Router and SSR patterns
production_grade: true
---

# Next.js — Production Skill

## Purpose
Safe Next.js changes respecting SSR/CSR boundaries.

## When To Use
- Projects with `app/` or `pages/` directory

## When Not To Use
- CRA-only React

## Architecture Rules
- Server Components default in app router — client only when needed
- `'use client'` only for hooks/browser APIs
- Data fetching in server components when pattern exists

## Coding Rules
- No `window` in server components
- Route handlers in `app/api/**` for APIs

## Anti Patterns
- fetch in client that should be server
- Large client bundles for static content

## Edge Cases
- Dynamic routes — validate params

## Testing Expectations
- Playwright for pages; RTL for components

## Escalation Rules
- Auth middleware changes → Security
