import { parseChannelMarker } from "../channels/feature-issue.js";
import { resolveChannelForIssue } from "../channels/issue-channel-link.js";
import { isEventEnabled, loadNotificationsConfig } from "./config.js";
import { formatSdlcNotification, githubIssueUrl, githubPrUrl } from "./formatter.js";
import { getNotificationAdapter } from "./registry.js";
import type { NotificationTarget, SdlcNotificationEvent } from "./types.js";

export interface NotifySdlcOpts {
  projectDir: string;
  event: Omit<SdlcNotificationEvent, "contract" | "version">;
  issueBody?: string;
  githubRepository?: string;
}

function resolveTarget(
  projectDir: string,
  config: ReturnType<typeof loadNotificationsConfig>,
  issueNumber: number,
  issueBody?: string
): NotificationTarget {
  const link = resolveChannelForIssue(projectDir, issueNumber);
  if (link) {
    return {
      provider: link.address.provider === "slack" ? "slack" : config.provider ?? "stdio",
      channel_id: link.address.channel_id,
      thread_id: link.address.thread_id,
    };
  }

  if (issueBody) {
    const marker = parseChannelMarker(issueBody);
    if (marker) {
      return {
        provider: marker.provider === "slack" ? "slack" : config.provider ?? "stdio",
        channel_id: marker.channel_id,
        thread_id: marker.thread_id,
      };
    }
  }

  return {
    provider: config.provider ?? "stdio",
    channel_id: config.channel_id ?? "dev-notifications",
    thread_id: config.thread_id,
  };
}

/** Fire-and-forget SDLC notification — never throws to caller. */
export async function notifySdlcEvent(opts: NotifySdlcOpts): Promise<{ sent: boolean; reason?: string }> {
  try {
    const config = loadNotificationsConfig(opts.projectDir);
    if (!config.enabled) return { sent: false, reason: "notifications_disabled" };
    if (!isEventEnabled(config, opts.event.type)) return { sent: false, reason: "event_disabled" };

    const event: SdlcNotificationEvent = {
      contract: "SdlcNotificationEvent",
      version: "1.0",
      ...opts.event,
    };

    const repo = opts.githubRepository ?? process.env.GITHUB_REPOSITORY;
    if (!event.url && event.pr_number) {
      event.url = githubPrUrl(repo, event.pr_number);
    } else if (!event.url) {
      event.url = githubIssueUrl(repo, event.issue_number);
    }

    const text = formatSdlcNotification(event);
    const target = resolveTarget(opts.projectDir, config, event.issue_number, opts.issueBody);
    const adapter = getNotificationAdapter(target.provider);

    await adapter.send({
      target,
      text,
      event,
      webhookUrl: config.webhook_url,
    });

    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[sdlc-notify] skipped: ${reason}`);
    return { sent: false, reason };
  }
}

export async function notifySdlcEventSafe(opts: NotifySdlcOpts): Promise<void> {
  await notifySdlcEvent(opts);
}
