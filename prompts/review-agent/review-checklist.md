# Review Checklist — review-agent

## Correctness
- [ ] Edge cases handled
- [ ] Error paths tested
- [ ] Types accurate

## Architecture
- [ ] No domain → infrastructure leak
- [ ] No circular imports introduced
- [ ] ADR respected

## AC
- [ ] Each AC has diff evidence

## Security
- [ ] Input validated
- [ ] Auth checked on new endpoints

## Anti-patterns (auto-FAIL)
- [ ] LGTM without analysis
- [ ] Findings without file:line
- [ ] PASS with known bugs
