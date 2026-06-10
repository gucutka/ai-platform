import crypto from "node:crypto";

export interface WebhookPayload {
  action?: string;
  issue?: { number: number; labels?: { name: string }[] };
  label?: { name: string };
  repository?: { full_name: string };
  installation?: { id: number };
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export interface WebhookDispatchPlan {
  contract: "WebhookDispatchPlan";
  version: "1.0";
  event: string;
  repository: string;
  issue_number: number;
  workflow: string;
  reason: string;
  label?: string;
}

export function planWebhookDispatch(
  eventName: string,
  payload: WebhookPayload
): WebhookDispatchPlan | null {
  const repo = payload.repository?.full_name;
  const issueNumber = payload.issue?.number;
  if (!repo || !issueNumber) return null;

  if (eventName === "issues" && payload.action === "labeled") {
    const label = payload.label?.name ?? "";
    if (label === "agent-route:pending") {
      return {
        contract: "WebhookDispatchPlan",
        version: "1.0",
        event: eventName,
        repository: repo,
        issue_number: issueNumber,
        workflow: "issue-routing.yml",
        reason: "label agent-route:pending",
        label,
      };
    }
    return {
      contract: "WebhookDispatchPlan",
      version: "1.0",
      event: eventName,
      repository: repo,
      issue_number: issueNumber,
      workflow: "sync-project-fields.yml",
      reason: "label sync",
      label,
    };
  }

  if (eventName === "issues" && payload.action === "opened") {
    const labels = payload.issue?.labels?.map((l) => l.name) ?? [];
    if (labels.includes("agent-route:pending")) {
      return {
        contract: "WebhookDispatchPlan",
        version: "1.0",
        event: eventName,
        repository: repo,
        issue_number: issueNumber,
        workflow: "issue-routing.yml",
        reason: "opened with agent-route:pending",
        label: "agent-route:pending",
      };
    }
  }

  return null;
}
