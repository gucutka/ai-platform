---
name: nestjs
description: Production NestJS patterns for backend-implement-agent
production_grade: true
---

# NestJS — Production Skill

## Purpose
Guide deterministic NestJS implementations: modules, DI, controllers, services, DTOs.

## When To Use
- backend-implement-agent on NestJS projects
- plan tasks with `stack: nestjs`

## When Not To Use
- Express-only repos without Nest bootstrap
- Frontend tasks

## Architecture Rules
- **Module boundary** — feature modules export facade; internals private
- **Controller** — HTTP only; delegate to service
- **Service** — business logic; inject repositories
- **No** EntityManager in controllers

## Coding Rules
- DTOs with `class-validator` for inputs
- Use `@Injectable()` for services
- Global exception filter for unhandled errors
- Async/await in controllers — return promises

## Patterns
```typescript
// Controller delegates
@Post()
create(@Body() dto: CreateTodoDto) {
  return this.todosService.create(dto);
}
```

## Anti Patterns
- God module importing everything
- Circular provider injection
- Raw SQL in controller
- `any` on DTO fields

## Examples
**Good:** New endpoint in existing `TodosController` + `TodosService.create`
**Bad:** New `AppModule` rewrite for one endpoint

## Edge Cases
- Validation pipe disabled globally — add method-level validation
- Multiple data sources — follow existing repository abstraction

## Testing Expectations
- `Test.createTestingModule` for unit tests
- E2E with supertest for HTTP contract

## Review Criteria
- Providers registered in correct module
- Exports minimal surface

## Escalation Rules
- New microservice boundary → escalate to Architect
- Auth guard changes → Security review
