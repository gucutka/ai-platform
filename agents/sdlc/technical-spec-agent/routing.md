# Routing — technical-spec-agent

- **Dispatched by:** workflow-agent, issue-routing.yml
- **Preconditions:** ProductSpec, ArchitectReviewDecision
- **Post:** contract-validate → optional contract-validator-agent → handoff-summarizer
- **Policies:** policies/routing-rules.yaml
