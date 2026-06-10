# Routing — workflow-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** TriageResult
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
