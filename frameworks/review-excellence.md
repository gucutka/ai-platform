# Review Excellence Framework

## Dimensions (all required)

| Dimension | Weight in verdict |
|-----------|-------------------|
| Correctness | Blocking |
| Maintainability | Major if severe |
| Readability | Minor unless blocks understanding |
| Architecture compliance | Blocking |
| AC coverage | Blocking |
| Test coverage | Major if behavior changed |
| Security | Blocking |
| Performance | Major if regression obvious |
| Extensibility | Minor |

## Superficial review indicators (FORBIDDEN)
- Empty findings + PASS
- "Looks good" without file references
- Style-only comments on FAIL

## Required depth
- Minimum 1 evidence citation per AC
- Architecture section explicit (even if "no violations")
- Security section explicit

## Output quality
Findings sorted by severity. Summary max 500 chars, actionable.
