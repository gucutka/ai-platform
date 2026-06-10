/**
 * Structured GitHub Issue body for feature intake (development phase).
 */

export interface FeatureIssueInput {
  title: string;
  user_story?: string;
  acceptance_criteria?: string | string[];
  area?: string;
  priority?: string;
  notes?: string;
  /** Raw body override — used when agent already formatted markdown */
  body?: string;
  source?: {
    provider?: string;
    channel_id?: string;
    thread_id?: string;
    session_id?: string;
  };
}

const CHANNEL_MARKER_PREFIX = "<!-- ai-platform-channel:";

export function channelMarkerFromSource(source: FeatureIssueInput["source"]): string | null {
  if (!source?.channel_id) return null;
  const parts = [
    source.provider ?? "unknown",
    source.channel_id,
    source.thread_id ?? "_",
  ];
  return `${CHANNEL_MARKER_PREFIX}${parts.join(":")} -->`;
}

export function parseChannelMarker(body: string): {
  provider: string;
  channel_id: string;
  thread_id?: string;
} | null {
  const m = body.match(/<!-- ai-platform-channel:([^:]+):([^:]+):([^ ]+) -->/);
  if (!m) return null;
  const thread = m[3] === "_" ? undefined : m[3];
  return { provider: m[1], channel_id: m[2], thread_id: thread };
}

export function formatFeatureIssueBody(input: FeatureIssueInput): string {
  if (input.body?.trim()) {
    const marker = channelMarkerFromSource(input.source);
    const parts = [input.body.trim()];
    if (marker && !input.body.includes(CHANNEL_MARKER_PREFIX)) parts.push("", marker);
    parts.push("", "<!-- ai-platform-feature-intake:v1 -->");
    return parts.join("\n");
  }

  const ac =
    Array.isArray(input.acceptance_criteria) ?
      input.acceptance_criteria.map((c) => `- [ ] ${c}`).join("\n")
    : input.acceptance_criteria?.trim() ?
      input.acceptance_criteria
        .split("\n")
        .map((line) => (line.trim().startsWith("-") ? line : `- [ ] ${line}`))
        .join("\n")
    : "_Pending — refine with BA._";

  const rows: [string, string][] = [];
  if (input.area) rows.push(["Area", input.area]);
  if (input.priority) rows.push(["Priority", input.priority]);
  if (input.source?.session_id) rows.push(["Channel session", input.source.session_id]);

  const meta =
    rows.length ?
      ["## Metadata", "", "| Field | Value |", "| --- | --- |", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join(
        "\n"
      )
    : "";

  const sections = [
    "## User Story",
    "",
    input.user_story?.trim() || "_As a user, I want … so that …_",
    "",
    "## Acceptance Criteria",
    "",
    ac,
  ];

  if (input.notes?.trim()) {
    sections.push("", "## Notes", "", input.notes.trim());
  }
  if (meta) sections.push("", meta);

  sections.push(
    "",
    "---",
    "",
    "_Created via **feature intake** — Workflow Agent assigns SDLC path after triage._",
    "",
    "<!-- ai-platform-feature-intake:v1 -->"
  );

  const marker = channelMarkerFromSource(input.source);
  if (marker) sections.push(marker);

  return sections.join("\n");
}

export function defaultFeatureIssueLabels(input: FeatureIssueInput): string[] {
  const labels = ["agent-route:pending"];
  const priority = input.priority?.toLowerCase();
  if (priority && /^p[0-3]$/.test(priority)) {
    labels.push(`priority:${priority}`);
  } else {
    labels.push("priority:p2");
  }
  const area = input.area?.toLowerCase();
  if (area && ["frontend", "backend", "fullstack", "infra"].includes(area)) {
    labels.push(`area:${area}`);
  }
  return labels;
}
