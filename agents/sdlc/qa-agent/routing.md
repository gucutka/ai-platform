# Routing — qa-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** ReviewReport
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
