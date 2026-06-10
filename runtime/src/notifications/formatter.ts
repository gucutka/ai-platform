import type { SdlcNotificationEvent } from "./types.js";

export function formatSdlcNotification(event: SdlcNotificationEvent): string {
  const issue = `#${event.issue_number}`;
  const pr = event.pr_number ? `PR #${event.pr_number}` : "";
  const link = event.url ? `<${event.url}|${event.url}>` : "";

  switch (event.type) {
    case "pr_created":
      return [
        "🚀 **PR created**",
        `${pr} for issue ${issue}`,
        event.title ? `_${event.title}_` : "",
        link,
      ]
        .filter(Boolean)
        .join("\n");

    case "review_pass":
      return [
        "✅ **Review passed**",
        `${pr} · issue ${issue}`,
        event.title ? `_${event.title}_` : "",
        link,
        "_Automerge eligible when CI is green._",
      ]
        .filter(Boolean)
        .join("\n");

    case "review_fail":
      return [
        "❌ **Review failed**",
        `${pr} · issue ${issue}`,
        event.title ? `_${event.title}_` : "",
        link,
      ]
        .filter(Boolean)
        .join("\n");

    case "merged":
      return [
        "🎉 **Merged**",
        `${pr} · issue ${issue}`,
        event.title ? `_${event.title}_` : "",
        link,
        "_Post-merge docs + release in progress._",
      ]
        .filter(Boolean)
        .join("\n");

    case "released":
      return [
        "📦 **Released**",
        event.release_tag ? `\`${event.release_tag}\`` : "",
        `issue ${issue}`,
        event.title ? `_${event.title}_` : "",
        link,
      ]
        .filter(Boolean)
        .join("\n");

    default:
      return `SDLC event \`${event.type}\` — issue ${issue}`;
  }
}

export function githubIssueUrl(repo: string | undefined, issueNumber: number): string | undefined {
  if (!repo?.includes("/")) return undefined;
  return `https://github.com/${repo}/issues/${issueNumber}`;
}

export function githubPrUrl(repo: string | undefined, prNumber: number): string | undefined {
  if (!repo?.includes("/")) return undefined;
  return `https://github.com/${repo}/pull/${prNumber}`;
}
