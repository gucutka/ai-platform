# Architectural Consistency Rules

Used by: architecture-review-agent, review-agent, implement self-review.

## Layer Violations (FAIL)
- UI/import infrastructure directly
- Domain importing HTTP framework
- Database access in route handlers without repository pattern (when repo uses layers)

## Dependency Violations (FAIL)
- Circular imports between modules
- Upstream module depends on downstream feature module
- New dependency on deprecated internal package

## Module Boundary Violations (FAIL)
- Exporting internal helpers as public API without plan
- Cross-feature imports bypassing public index

## Contract Violations (FAIL)
- API response shape change without version/plan
- Event schema change without contract update

## ADR Violations (FAIL)
- Code contradicts Accepted ADR in context
- New pattern requiring ADR but none referenced

## Detection
Review agent MUST set `architecture_compliance` < 1.0 when any violation found.
