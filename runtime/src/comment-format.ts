/** Shared GitHub comment markdown — human-readable, machine-parseable contracts in <details>. */

export function machineMarker(kind: string, id?: string): string {
  return id ? `<!-- ai-platform-${kind}:${id} -->` : `<!-- ai-platform-${kind} -->`;
}

const AGENT_LABELS: Record<string, string> = {
  "triage-agent": "Triage",
  "workflow-agent": "Workflow routing",
  "requirements-agent": "Requirements",
  "product-spec-agent": "Product spec",
  "technical-spec-agent": "Technical design",
  "plan-agent": "Implementation plan",
  "frontend-implement-agent": "Frontend implementation",
  "backend-implement-agent": "Backend implementation",
  "fullstack-implement-agent": "Fullstack implementation",
  "infra-implement-agent": "Infrastructure",
  "architecture-review-agent": "Architecture review",
  "review-agent": "Code review",
  "qa-agent": "QA verification",
  "security-agent": "Security scan",
  "docs-agent": "Documentation",
  "release-agent": "Release",
  "handoff-summarizer-agent": "Handoff summary",
  "contract-validator-agent": "Contract validation",
  "architect-gate": "Architect gate",
};

export function humanAgentName(agentId: string): string {
  return AGENT_LABELS[agentId] ?? agentId.replace(/-agent$/, "").replace(/-/g, " ");
}

export function formatVerdictBadge(verdict: string): string {
  const v = verdict.toUpperCase();
  if (v === "PASS" || v === "APPROVED" || v === "SUCCESS") return "✅ Pass";
  if (v === "FAIL" || v === "FAILED" || v === "REJECTED") return "❌ Fail";
  if (v === "BLOCK" || v === "BLOCKED") return "🚫 Blocked";
  if (v === "PENDING" || v === "WAITING") return "⏳ Pending";
  if (v === "SKIP" || v === "SKIPPED") return "⏭ Skipped";
  return verdict;
}

export function formatStatusHeader(title: string, verdict?: string): string {
  if (verdict) {
    return `## ${title} — ${formatVerdictBadge(verdict)}`;
  }
  return `## ${title}`;
}

export function bulletList(items: string[], empty = "_None._"): string {
  const filtered = items.map((s) => s.trim()).filter(Boolean);
  if (!filtered.length) return empty;
  return filtered.map((s) => `- ${s}`).join("\n");
}

export function formatKeyValueTable(rows: [string, string][]): string {
  if (!rows.length) return "_No data._";
  const body = rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n");
  return `| Field | Value |\n|-------|-------|\n${body}`;
}

export function formatContractFence(data: Record<string, unknown>): string {
  return `\`\`\`ai-platform-contract\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

export function formatContractDetails(
  label: string,
  data: Record<string, unknown>
): string {
  return `<details>\n<summary>${label}</summary>\n\n${formatContractFence(data)}\n</details>`;
}

export function formatGateNotice(opts: {
  title: string;
  body: string;
  marker?: string;
}): string {
  const marker = opts.marker ? `${opts.marker}\n` : "";
  return `${marker}${formatStatusHeader(opts.title)}\n\n${opts.body.trim()}`;
}

function formatFindings(findings: unknown): string {
  if (!Array.isArray(findings) || !findings.length) {
    return "_No findings._";
  }
  return findings
    .map((f) => {
      if (typeof f === "string") return `- ${f}`;
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        const sev = o.severity ? `**${o.severity}** — ` : "";
        const msg = o.message ?? o.summary ?? o.description ?? JSON.stringify(o);
        const loc = o.file ? ` (\`${o.file}\`${o.line != null ? `:${o.line}` : ""})` : "";
        return `- ${sev}${msg}${loc}`;
      }
      return `- ${String(f)}`;
    })
    .join("\n");
}

/** Human-readable prelude before contract JSON (by contract name). */
export function formatContractNarrative(data: Record<string, unknown>): string {
  const contract = String(data.contract ?? "");

  switch (contract) {
    case "BusinessRequirements": {
      const ac = Array.isArray(data.acceptance_criteria)
        ? (data.acceptance_criteria as string[])
        : [];
      return [
        data.summary ? String(data.summary) : "",
        ac.length ? `### Acceptance criteria\n\n${bulletList(ac)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    case "ProductSpec":
      return [
        data.feature_summary ? String(data.feature_summary) : "",
        Array.isArray(data.user_stories)
          ? `### User stories\n\n${bulletList(data.user_stories as string[])}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "TechnicalDesign":
      return [
        data.overview ? String(data.overview) : "",
        Array.isArray(data.modules)
          ? `### Modules\n\n${bulletList(
              (data.modules as { name?: string }[]).map((m) => m.name ?? JSON.stringify(m))
            )}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "ImplementationPlan": {
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const lines = tasks.map((t, i) => {
        const task = t as { title?: string; files?: string[] };
        const files = task.files?.length
          ? ` — \`${task.files.slice(0, 4).join("`, `")}\`${task.files.length > 4 ? "…" : ""}`
          : "";
        return `${i + 1}. ${task.title ?? "Task"}${files}`;
      });
      return lines.length
        ? `### Tasks (${lines.length})\n\n${lines.join("\n")}`
        : "_Plan tasks pending._";
    }
    case "TriageResult":
      return formatKeyValueTable([
        ["Type", String(data.issue_type ?? "—")],
        ["Complexity", String(data.complexity ?? "—")],
        ["Area", String(data.area ?? "—")],
        ["Risk", String(data.risk_level ?? "—")],
      ]);
    case "WorkflowDecision":
      return [
        formatKeyValueTable([
          ["Path", String(data.path_key ?? "—")],
          ["Risk", String(data.risk_level ?? "—")],
          ["Review level", String(data.review_level ?? "—")],
        ]),
        Array.isArray(data.mandatory_agents)
          ? `### Agents in path\n\n${bulletList(
              (data.mandatory_agents as string[]).map(humanAgentName)
            )}`
          : "",
        Array.isArray(data.skip_stages) && (data.skip_stages as string[]).length
          ? `### Skipped stages\n\n${bulletList(data.skip_stages as string[])}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    case "ReviewReport":
    case "ArchitectureReviewReport":
      return [
        data.summary ? String(data.summary) : "",
        `### Findings\n\n${formatFindings(data.findings)}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    case "SecurityScanReport":
      return [
        data.summary ? String(data.summary) : "",
        `### Findings\n\n${formatFindings(data.findings)}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    case "VerificationResult":
      return formatKeyValueTable([
        ["CI status", String(data.ci_status ?? "—")],
        ["Ready to merge", String(data.ready_for_merge ?? "—")],
        ["Tests passed", String(data.tests_passed ?? "—")],
      ]);
    case "DocumentationResult":
      return [
        data.summary ? String(data.summary) : "",
        Array.isArray(data.docs_updated) && (data.docs_updated as string[]).length
          ? `### Updated docs\n\n${bulletList(data.docs_updated as string[])}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    default:
      if (data.summary) return String(data.summary);
      return "";
  }
}

export function formatAgentContractComment(
  agentId: string,
  data: Record<string, unknown>
): string {
  const contract = String(data.contract ?? "Contract");
  const verdict =
    data.verdict != null ? String(data.verdict) : data.status != null ? String(data.status) : undefined;
  const title = humanAgentName(agentId);
  const narrative = formatContractNarrative(data);
  const header = verdict
    ? formatStatusHeader(title, verdict)
    : `## ${title}`;

  const parts = [
    machineMarker("agent", agentId),
    header,
    narrative,
    formatContractDetails(`${contract}@${data.version ?? "1.0"}`, data),
  ].filter((p) => p.trim());

  return parts.join("\n\n");
}

export function formatReviewComment(
  agentLabel: string,
  contract: Record<string, unknown>,
  footer?: string
): string {
  const verdict = String(contract.verdict ?? "—");
  const narrative = formatContractNarrative(contract);
  const parts = [
    formatStatusHeader(agentLabel, verdict),
    narrative,
    formatContractDetails(
      `${contract.contract ?? "Report"}@${contract.version ?? "1.0"}`,
      contract
    ),
  ];
  if (footer) parts.push(`---\n\n_${footer}_`);
  return parts.join("\n\n");
}

export function formatHandoffMarkdown(data: {
  from_agent: string;
  to_agent: string;
  stage: string;
  summary: string;
  contracts_passed: string[];
}): string {
  return [
    machineMarker("handoff"),
    `## Handoff — ${humanAgentName(data.from_agent)} → ${humanAgentName(data.to_agent)}`,
    `**Stage:** \`${data.stage}\``,
    data.summary.trim(),
    data.contracts_passed.length
      ? `### Contracts verified\n\n${bulletList(data.contracts_passed)}`
      : "",
    formatContractDetails("HandoffSummary@1.0", data as unknown as Record<string, unknown>),
  ]
    .filter((p) => p.trim())
    .join("\n\n");
}
