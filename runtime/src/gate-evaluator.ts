import type { Manifest } from "./types.js";
import { isArchitectGateEnabled, ARCHITECT_GATE_LABELS } from "./architect-gate.js";
import { ARCH_REVIEW_LABELS } from "./arch-review.js";
import { SECURITY_LABELS } from "./security-labels.js";

export interface GateDecision {
  allowed: boolean;
  issueLabels: string[];
  prLabels: string[];
  blockAutomerge: boolean;
  comment?: string;
  reason?: string;
}

export interface PostReviewGateInput {
  manifest: Manifest;
  verdict: string;
  issueLabels?: string[];
  prLabels?: string[];
}

function gates(manifest: Manifest) {
  return resolveEffectiveGates(manifest);
}

/** Regulated tier forces security + human gates. */
export function resolveEffectiveGates(manifest: Manifest) {
  const gate = { ...(manifest.gates ?? {}) };
  if (manifest.client_tier === "regulated") {
    gate.require_human_review = true;
    gate.require_security_scan = true;
    gate.automerge_on_ci_pass = false;
  }
  return gate;
}

function automerge(manifest: Manifest) {
  return manifest.automerge ?? {};
}

/** Post review-agent: labels + automerge eligibility from manifest.gates. */
export function evaluatePostReviewGates(input: PostReviewGateInput & {
  skipSecurityRequirement?: boolean;
}): GateDecision {
  const { manifest, verdict } = input;
  const gate = gates(manifest);
  const auto = automerge(manifest);
  const v = verdict.toUpperCase();

  if (v === "FAIL") {
    return {
      allowed: false,
      issueLabels: ["agent-route:blocked"],
      prLabels: ["agent:review-failed"],
      blockAutomerge: true,
      reason: "review-agent verdict FAIL",
    };
  }

  if (gate.require_human_review) {
    return {
      allowed: true,
      issueLabels: ["human-review:required", "agent-route:ready-to-merge"],
      prLabels: ["human-review:required"],
      blockAutomerge: true,
      comment:
        "## Review passed — human approval required\n\nManifest has `require_human_review: true`. Automerge stays disabled until label `human-review:approved` is applied.",
      reason: "require_human_review",
    };
  }

  if (!input.skipSecurityRequirement && gate.require_security_scan) {
    return {
      allowed: true,
      issueLabels: [SECURITY_LABELS.required],
      prLabels: [SECURITY_LABELS.required],
      blockAutomerge: true,
      comment:
        "## Review passed — security scan next\n\nManifest requires a security scan. Automerge stays disabled until label `security-scan:passed` is applied.",
      reason: "require_security_scan",
    };
  }

  const automergeAllowed =
    auto.enabled !== false && gate.automerge_on_ci_pass !== false;

  return {
    allowed: true,
    issueLabels: ["agent-route:ready-to-merge"],
    prLabels: ["agent:approved"],
    blockAutomerge: !automergeAllowed,
    comment: automergeAllowed
      ? "## Review passed — automerge eligible\n\nWhen CI is green, **automerge** will squash-merge this PR (`automerge.yml`)."
      : "## Review passed\n\nAutomerge is disabled in the project manifest.",
  };
}

/** Block technical-spec/plan when architect gate is on and not approved. */
export function evaluateArchitectReviewGate(
  manifest: Manifest,
  issueLabels: string[]
): GateDecision {
  if (!isArchitectGateEnabled(manifest)) {
    return { allowed: true, issueLabels: [], prLabels: [], blockAutomerge: false };
  }

  if (issueLabels.includes(ARCHITECT_GATE_LABELS.approved)) {
    return { allowed: true, issueLabels: [], prLabels: [], blockAutomerge: false };
  }

  if (issueLabels.includes(ARCHITECT_GATE_LABELS.rejected)) {
    return {
      allowed: false,
      issueLabels: ["agent-route:blocked"],
      prLabels: [],
      blockAutomerge: true,
      reason: "architect_review_gate: rejected",
      comment:
        "## Architect gate rejected\n\nUpdate the product spec or close the issue before re-running the pipeline.",
    };
  }

  return {
    allowed: false,
    issueLabels: [ARCHITECT_GATE_LABELS.pending, "agent-route:blocked"],
    prLabels: [],
    blockAutomerge: true,
    reason: "architect_review_gate: approval required before technical-spec/plan",
    comment:
      "## Architect gate pending\n\nReview **ProductSpec@1.0**, then add label `architect-gate:approved` to continue the pipeline.",
  };
}

/** Block review-agent when architecture review required and not passed. */
export function evaluateArchitectureReviewPrecondition(
  required: boolean,
  issueLabels: string[]
): GateDecision {
  if (!required) {
    return { allowed: true, issueLabels: [], prLabels: [], blockAutomerge: false };
  }

  if (issueLabels.includes(ARCH_REVIEW_LABELS.passed)) {
    return { allowed: true, issueLabels: [], prLabels: [], blockAutomerge: false };
  }

  if (issueLabels.includes(ARCH_REVIEW_LABELS.failed)) {
    return {
      allowed: false,
      issueLabels: ["agent-route:blocked"],
      prLabels: [ARCH_REVIEW_LABELS.failed],
      blockAutomerge: true,
      reason: "architecture_review_agent: arch-review failed",
      comment:
        "## Architecture review failed\n\nFix reported violations before code review can run.",
    };
  }

  return {
    allowed: false,
    issueLabels: [ARCH_REVIEW_LABELS.pending, "agent-route:blocked"],
    prLabels: [ARCH_REVIEW_LABELS.pending],
    blockAutomerge: true,
    reason: "architecture_review_agent: arch-review:passed required before review",
    comment:
      "## Architecture review pending\n\nThe architecture review agent must pass before code review runs.",
  };
}

/** After security-agent PASS — restore merge labels (skip security requirement). */
export function evaluatePostSecurityGates(input: {
  manifest: Manifest;
  reviewVerdict: string;
  securityVerdict: string;
}): GateDecision {
  const v = String(input.securityVerdict).toUpperCase();
  if (v !== "PASS") {
    return {
      allowed: false,
      issueLabels: ["agent-route:blocked"],
      prLabels: [SECURITY_LABELS.failed],
      blockAutomerge: true,
      reason: "security-agent verdict FAIL",
    };
  }
  return evaluatePostReviewGates({
    manifest: input.manifest,
    verdict: input.reviewVerdict,
    skipSecurityRequirement: true,
  });
}

/** Automerge.yml preconditions (mirrors workflow logic). */
export function evaluateAutomergeAllowed(
  manifest: Manifest,
  prLabels: string[],
  opts?: { isAiPr?: boolean; reviewApproved?: boolean }
): GateDecision {
  const gate = gates(manifest);
  const auto = automerge(manifest);

  if (auto.enabled === false || gate.automerge_on_ci_pass === false) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "automerge disabled in manifest",
    };
  }

  if (prLabels.includes("agent:review-failed")) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "review failed",
    };
  }

  if (gate.require_human_review && !prLabels.includes("human-review:approved")) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "waiting for human-review:approved",
    };
  }

  if (gate.require_security_scan && !prLabels.includes(SECURITY_LABELS.passed)) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "waiting for security-scan:passed",
    };
  }

  if (
    gate.automerge_requires_review_pass !== false &&
    !gate.require_human_review &&
    opts?.reviewApproved === false
  ) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "waiting for review-agent PASS",
    };
  }

  if (auto.only_ai_prs !== false && opts?.isAiPr === false) {
    return {
      allowed: false,
      issueLabels: [],
      prLabels: [],
      blockAutomerge: true,
      reason: "not an AI Platform PR",
    };
  }

  return { allowed: true, issueLabels: [], prLabels: [], blockAutomerge: false };
}
