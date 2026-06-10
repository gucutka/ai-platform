import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ChannelAddress,
  ChannelConversationSession,
  LifecyclePhaseId,
} from "./types.js";
import { channelAddressKey } from "./types.js";

function sessionsDir(projectDir: string): string {
  return path.join(projectDir, ".ai-platform", "channel-sessions");
}

function sessionFile(projectDir: string, sessionId: string): string {
  return path.join(sessionsDir(projectDir), `${sessionId}.json`);
}

function indexFile(projectDir: string): string {
  return path.join(sessionsDir(projectDir), "index.json");
}

export function deriveSessionId(address: ChannelAddress, projectId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${channelAddressKey(address)}:${projectId}`)
    .digest("hex")
    .slice(0, 24);
}

export function loadChannelSession(
  projectDir: string,
  sessionId: string
): ChannelConversationSession | null {
  const p = sessionFile(projectDir, sessionId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as ChannelConversationSession;
}

export function loadChannelSessionByAddress(
  projectDir: string,
  address: ChannelAddress,
  projectId: string
): ChannelConversationSession | null {
  const id = deriveSessionId(address, projectId);
  return loadChannelSession(projectDir, id);
}

type SessionIndex = Record<string, string>;

function loadIndex(projectDir: string): SessionIndex {
  const p = indexFile(projectDir);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8")) as SessionIndex;
}

function saveIndex(projectDir: string, index: SessionIndex): void {
  fs.mkdirSync(sessionsDir(projectDir), { recursive: true });
  fs.writeFileSync(indexFile(projectDir), JSON.stringify(index, null, 2));
}

export function getOrCreateChannelSession(opts: {
  projectDir: string;
  projectId: string;
  address: ChannelAddress;
  phase: LifecyclePhaseId;
  agentId: string;
  cloudSessionId?: string;
}): ChannelConversationSession {
  const sessionId = deriveSessionId(opts.address, opts.projectId);
  const existing = loadChannelSession(opts.projectDir, sessionId);
  if (existing) {
    existing.message_count += 1;
    existing.updated_at = new Date().toISOString();
    if (opts.cloudSessionId) existing.cloud_session_id = opts.cloudSessionId;
    saveChannelSession(opts.projectDir, existing);
    return existing;
  }

  const now = new Date().toISOString();
  const session: ChannelConversationSession = {
    contract: "ChannelConversationSession",
    version: "1.0",
    session_id: sessionId,
    address_key: channelAddressKey(opts.address),
    address: opts.address,
    project_id: opts.projectId,
    phase: opts.phase,
    agent_id: opts.agentId,
    cloud_session_id: opts.cloudSessionId,
    status: "active",
    message_count: 1,
    artifacts_written: [],
    created_at: now,
    updated_at: now,
  };
  saveChannelSession(opts.projectDir, session);

  const index = loadIndex(opts.projectDir);
  index[channelAddressKey(opts.address)] = sessionId;
  saveIndex(opts.projectDir, index);
  return session;
}

export function saveChannelSession(
  projectDir: string,
  session: ChannelConversationSession
): void {
  fs.mkdirSync(sessionsDir(projectDir), { recursive: true });
  fs.writeFileSync(sessionFile(projectDir, session.session_id), JSON.stringify(session, null, 2));
}

export function listChannelSessions(projectDir: string): ChannelConversationSession[] {
  const dir = sessionsDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as ChannelConversationSession);
}
