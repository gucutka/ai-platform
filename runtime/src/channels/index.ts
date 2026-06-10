export * from "./types.js";
export {
  loadChannelsConfig,
  saveChannelsConfig,
  resolveChannelBinding,
  upsertChannelBinding,
  defaultAgentForPhase,
} from "./config.js";
export {
  getChannelAdapter,
  listChannelProviders,
  registerChannelAdapter,
  ensureChannelAdaptersRegistered,
} from "./registry.js";
export { processChannelInbound, processChannelMessageLocal } from "./orchestrator.js";
export { listChannelSessions } from "./session-store.js";
export {
  listAdrs,
  nextAdrNumber,
  writeAdrDraft,
  formatAdrIndexMarkdown,
  buildAdrMarkdown,
} from "./adr-generator.js";
export {
  evaluateArchitectureReadiness,
  isLayerApproved,
  loadApprovedLayerSnippet,
  buildArchitectureContextParts,
} from "./architecture-context.js";
export {
  evaluateDevelopmentReadiness,
  buildDevelopmentContextParts,
} from "./development-context.js";
export {
  formatFeatureIssueBody,
  defaultFeatureIssueLabels,
  parseChannelMarker,
} from "./feature-issue.js";
export {
  linkIssueToChannelSession,
  resolveChannelForIssue,
  loadIssueChannelLinks,
} from "./issue-channel-link.js";
