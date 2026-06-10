# Frontend Standards

## Components
- Functional components + hooks
- Props interfaces exported
- Presentational vs container separation

## Styling
- Match repo convention (CSS modules / Tailwind)
- No hardcoded hex colors if tokens exist

## Accessibility
- `aria-label` on icon-only buttons
- Form inputs linked to labels
- Focus management on modals

## Data
- Fetch in hooks/services — not in leaf components
- Loading + error UI required

## Testing
- RTL for units, Playwright for E2E per repo setup
