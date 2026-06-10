# Routing — triage-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** stage label
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
