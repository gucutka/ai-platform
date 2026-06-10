---
name: node-typescript
description: Node.js TypeScript backend patterns
production_grade: true
---

# Node TypeScript — Production Skill

## Purpose
Express/Fastify/plain Node TS implementations with strict typing.

## When To Use
- demo-todo-app, Express services, node backends

## When Not To Use
- Pure frontend

## Architecture Rules
- Separate routes, handlers, services
- No business logic in route registration file

## Coding Rules
- `strict` compatible types
- `import type` for type-only imports
- ESM: include `.js` extensions if repo does

## Patterns
- Central error middleware
- Zod/io-ts if repo already uses

## Anti Patterns
- `require` in ESM project
- Mutating `module.exports` mid-file

## Edge Cases
- `__dirname` in ESM — use `import.meta.url`

## Testing Expectations
- `node:test` or Jest per repo

## Review Criteria
- Handlers return proper status codes

## Escalation Rules
- New process-level singleton → Architect
