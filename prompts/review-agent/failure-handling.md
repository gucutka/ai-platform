# Failure Handling — review-agent

If diff missing → FAIL with finding "Unable to review: no diff".
If plan missing → reduce spec_compliance, note in findings.
Security critical → FAIL, category `security`, severity `critical`.
