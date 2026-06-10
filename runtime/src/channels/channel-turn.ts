import type { ChannelAction, ChannelAgentTurn } from "./types.js";
import { SLACK_REPLY_FORMAT } from "./slack-reply-format.js";

const TURN_FENCE = /```ai-platform-channel-turn\s*([\s\S]*?)```/i;
const CONTRACT_FENCE = /```ai-platform-contract\s*([\s\S]*?)```/i;

export function parseChannelAgentTurn(text: string): ChannelAgentTurn {
  const fence = text.match(TURN_FENCE)?.[1] ?? text.match(CONTRACT_FENCE)?.[1];
  if (fence) {
    try {
      const data = JSON.parse(fence.trim()) as ChannelAgentTurn;
      if (data.reply) return normalizeTurn(data);
    } catch {
      /* fall through */
    }
  }

  return {
    contract: "ChannelAgentTurn",
    version: "1.0",
    reply: text.trim(),
    actions: [],
  };
}

function normalizeTurn(data: Partial<ChannelAgentTurn>): ChannelAgentTurn {
  return {
    contract: "ChannelAgentTurn",
    version: "1.0",
    reply: String(data.reply ?? ""),
    actions: Array.isArray(data.actions) ? data.actions : [],
    phase_complete: data.phase_complete === true,
  };
}

/** Parse from MCP emit_channel_turn tool result */
export function parseChannelTurnFromRecord(
  data: Record<string, unknown> | null | undefined
): ChannelAgentTurn | null {
  if (!data || !data.reply) return null;
  return normalizeTurn(data as Partial<ChannelAgentTurn>);
}

export const CHANNEL_TURN_INSTRUCTIONS = `
${SLACK_REPLY_FORMAT}

Emit **ChannelAgentTurn@1.0** via the **emit_channel_turn** tool (or fenced block in CLI):

\`\`\`ai-platform-channel-turn
{
  "contract": "ChannelAgentTurn",
  "version": "1.0",
  "reply": "Slack mrkdwn shown to the user — questions, summary, next steps",
  "actions": [],
  "phase_complete": false
}
\`\`\`

### actions (optional array)

| type | fields |
|------|--------|
| write_knowledge | layer (business|product|technical), path, content |
| write_adr | title, context, decision, consequences?, status?, slug?, references[] |
| ask_clarification | questions[] |
| approve_layer | layer |
| scaffold_project | template, project_id, target_dir |
| create_github_issue | title, user_story, acceptance_criteria, area, priority, body?, labels[] |
| noop | — |

Rules:
- Ask clarifying questions before writing canonical knowledge
- One write_knowledge per distinct doc file
- Use write_adr for architectural decisions (auto-numbered under docs/knowledge/technical/adr/)
- Use approve_layer only when the user confirms or content is complete
- For development phase, use create_github_issue with full user story + AC
- write_knowledge / ADR / issue body content may use normal markdown (files & GitHub)
`;
