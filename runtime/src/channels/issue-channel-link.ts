import fs from "node:fs";
import path from "node:path";
import type { ChannelAddress, ChannelConversationSession } from "./types.js";

export interface IssueChannelLink {
  issue_number: number;
  session_id: string;
  address: ChannelAddress;
  linked_at: string;
}

function linksPath(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "channel-sessions", "issue-links.json");
}

export function loadIssueChannelLinks(projectDir: string): Record<string, IssueChannelLink> {
  const p = linksPath(projectDir);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, IssueChannelLink>;
}

export function linkIssueToChannelSession(
  projectDir: string,
  issueNumber: number,
  session: ChannelConversationSession
): IssueChannelLink {
  const links = loadIssueChannelLinks(projectDir);
  const entry: IssueChannelLink = {
    issue_number: issueNumber,
    session_id: session.session_id,
    address: session.address,
    linked_at: new Date().toISOString(),
  };
  links[String(issueNumber)] = entry;
  fs.mkdirSync(path.dirname(linksPath(projectDir)), { recursive: true });
  fs.writeFileSync(linksPath(projectDir), JSON.stringify(links, null, 2));
  return entry;
}

export function resolveChannelForIssue(
  projectDir: string,
  issueNumber: number
): IssueChannelLink | null {
  return loadIssueChannelLinks(projectDir)[String(issueNumber)] ?? null;
}
