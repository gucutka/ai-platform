/**
 * Provider-agnostic channel types.
 * Swap Slack → Teams → custom webhook by implementing ChannelAdapter only.
 */

export type ChannelProviderId = string;

/** Stable address for a conversation thread (provider-specific ids inside). */
export interface ChannelAddress {
  provider: ChannelProviderId;
  /** Workspace / tenant / org id */
  workspace_id?: string;
  /** Channel / room / chat id */
  channel_id: string;
  /** Thread / topic / reply-to id (optional for top-level messages) */
  thread_id?: string;
}

export function channelAddressKey(address: ChannelAddress): string {
  return [
    address.provider,
    address.workspace_id ?? "_",
    address.channel_id,
    address.thread_id ?? "_",
  ].join(":");
}

export interface InboundChannelEvent {
  contract: "InboundChannelEvent";
  version: "1.0";
  address: ChannelAddress;
  message_id: string;
  text: string;
  user_id?: string;
  user_display_name?: string;
  timestamp?: string;
  /** Raw provider payload for debugging */
  raw?: unknown;
}

export interface OutboundChannelBlock {
  type: "section" | "divider" | "actions";
  text?: string;
  markdown?: boolean;
  elements?: { action_id: string; label: string; value?: string }[];
}

export interface OutboundChannelMessage {
  contract: "OutboundChannelMessage";
  version: "1.0";
  address: ChannelAddress;
  text: string;
  /** Provider may map blocks to native UI (Slack blocks, Teams adaptive cards, etc.) */
  blocks?: OutboundChannelBlock[];
  thread_reply?: boolean;
}

export type LifecyclePhaseId = "intake" | "discovery" | "architecture" | "development";

export interface ChannelBinding {
  /** Match channel_id (exact or prefix with *) */
  channel_id: string;
  phase: LifecyclePhaseId;
  agent_id: string;
  label?: string;
}

export interface ChannelsConfig {
  version: string;
  enabled: boolean;
  default_provider?: ChannelProviderId;
  bindings: ChannelBinding[];
}

export interface ChannelConversationSession {
  contract: "ChannelConversationSession";
  version: "1.0";
  session_id: string;
  address_key: string;
  address: ChannelAddress;
  project_id: string;
  phase: LifecyclePhaseId;
  agent_id: string;
  cloud_session_id?: string;
  status: "active" | "awaiting_human" | "completed";
  message_count: number;
  artifacts_written: string[];
  created_at: string;
  updated_at: string;
}

export type ChannelActionType =
  | "write_knowledge"
  | "write_adr"
  | "ask_clarification"
  | "approve_layer"
  | "create_github_issue"
  | "scaffold_project"
  | "noop";

export interface ChannelAction {
  type: ChannelActionType;
  layer?: string;
  path?: string;
  content?: string;
  questions?: string[];
  title?: string;
  body?: string;
  labels?: string[];
  template?: string;
  project_id?: string;
  target_dir?: string;
  /** write_adr fields (title also used by create_github_issue) */
  context?: string;
  decision?: string;
  consequences?: string;
  status?: string;
  slug?: string;
  references?: string[];
  /** create_github_issue structured intake */
  user_story?: string;
  acceptance_criteria?: string | string[];
  area?: string;
  priority?: string;
  notes?: string;
}

export interface ChannelAgentTurn {
  contract: "ChannelAgentTurn";
  version: "1.0";
  reply: string;
  actions?: ChannelAction[];
  phase_complete?: boolean;
}

export interface ChannelTurnResult {
  contract: "ChannelTurnResult";
  version: "1.0";
  inbound: InboundChannelEvent;
  turn: ChannelAgentTurn;
  outbound: OutboundChannelMessage;
  session: ChannelConversationSession;
  actions_applied: string[];
}

/** Adapter contract — one implementation per provider (slack, teams, webhook, …). */
export interface ChannelAdapter {
  readonly providerId: ChannelProviderId;

  /** Verify inbound HTTP webhook (optional — stdio skips). */
  verifyInbound?(opts: {
    rawBody: string;
    headers: Record<string, string | undefined>;
    secret?: string;
  }): boolean;

  /** Parse provider payload → normalized inbound event(s). */
  parseInbound(raw: unknown): InboundChannelEvent[];

  /** Format outbound message for provider API (returns body + headers). */
  formatOutbound(message: OutboundChannelMessage): {
    body: Record<string, unknown>;
    headers?: Record<string, string>;
  };

  /** Send reply via provider API (optional — CLI may only print). */
  sendReply?(
    message: OutboundChannelMessage,
    opts: { token?: string; apiBaseUrl?: string }
  ): Promise<void>;
}

export interface ChannelAdapterFactory {
  create(opts?: Record<string, unknown>): ChannelAdapter;
}
