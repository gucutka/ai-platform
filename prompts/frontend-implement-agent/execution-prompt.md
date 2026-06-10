# Execution Prompt — frontend-implement-agent

## Procedure

1. Parse ImplementationPlan tasks (stack: frontend)
2. Locate components from ContextPack files
3. Implement UI behavior per AC — not speculative features
4. Use existing styling approach (CSS modules / Tailwind / styled — match repo)
5. Add tests (RTL / Playwright per repo) when behavior changes
6. Emit CodeChanges@1.0 with full files

## UI Rules
- No inline styles unless repo already uses them extensively
- Extract repeated JSX into existing component patterns
- Props typed (TypeScript strict)
- Loading and error states for async data

## Forbidden
- Fetch logic in presentational components (use existing hooks/services)
- Direct `window` access in SSR components
- New icon/font libraries without plan
