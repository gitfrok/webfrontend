// The product's status vocabulary (T-0047, SPEC-0047 AC6/AC7, ADR-0069 law 2).
//
// One table, because the law is "never hue-only encoding" and a law enforced
// per-component is not enforced. Every member carries a glyph and a label; the
// tone is a token CLASS, never a colour value, so a component cannot reach past
// this file to a hex.
//
// Severity is deliberately NOT a red-to-green heat ramp. The brand's rule for
// intensity is a single-hue lightness ramp (§7.6), so severity carries:
//   - a rank (4/4 … 1/4) — order, readable as text;
//   - a glyph — shape;
//   - a lightness step from the blue brand ramp — luminance, not hue.
// Green for "low" is exactly the pairing that collapses under deuteranopia,
// and a test refuses it.

export type StatusKey =
  // severity
  | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  // merge gate / scan outcome
  | 'PASSED' | 'BLOCKED' | 'UNAVAILABLE' | 'RUNNING'
  // finding lifecycle
  | 'OPEN' | 'RESOLVED'
  // triage disposition
  | 'ACCEPTED' | 'FALSE_POSITIVE' | 'FIX' | 'DEFER'
  // merge-request review disposition (T-0049)
  | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'
  // evidence pack
  | 'READY' | 'PENDING' | 'FAILED' | 'ASSEMBLING'
  // auditor grant lifecycle (T-0052)
  | 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  // CI job state (T-0061)
  | 'QUEUED' | 'RUNNING_JOB' | 'SUCCEEDED' | 'FAILED_JOB' | 'CANCELLED'
  // policy decision outcome (T-0063)
  | 'ALLOWED' | 'DENIED'
  // release tag agreement (T-0066)
  | 'TAG_MOVED' | 'TAG_GONE'
  | 'ARCHIVED'
  | 'PLANE_CONNECTED' | 'PLANE_STALE' | 'PLANE_REVOKED' | 'PLANE_NEVER_CONNECTED'
  | 'PLANE_UNKNOWN';

export interface StatusDescriptor {
  /** Token class from tokens.css. Never a colour value. */
  tone: 'gf-status-success' | 'gf-status-danger' | 'gf-status-warn' | 'gf-status-info' | 'gf-status-pending';
  /** The redundant shape channel. */
  glyph: string;
  /** The redundant text channel — always a word, never only a symbol. */
  label: string;
  /** Severity only: 4 is the most severe. 0 for everything else. */
  rank?: number;
  /** Brand-ramp lightness step for intensity, where one applies. */
  ramp?: '--gf-deep' | '--gf-blue' | '--gf-sky' | '--gf-frost';
}

export const STATUS_VOCABULARY: Record<StatusKey, StatusDescriptor> = {
  // --- severity: luminance ramp + rank, no hue coding -------------------
  CRITICAL: { tone: 'gf-status-danger', glyph: '✕', label: 'Critical', rank: 4, ramp: '--gf-deep' },
  HIGH: { tone: 'gf-status-warn', glyph: '!', label: 'High', rank: 3, ramp: '--gf-blue' },
  MEDIUM: { tone: 'gf-status-info', glyph: '●', label: 'Medium', rank: 2, ramp: '--gf-sky' },
  LOW: { tone: 'gf-status-pending', glyph: '○', label: 'Low', rank: 1, ramp: '--gf-frost' },

  // --- outcomes ----------------------------------------------------------
  PASSED: { tone: 'gf-status-success', glyph: '✓', label: 'Passed' },
  BLOCKED: { tone: 'gf-status-danger', glyph: '✕', label: 'Blocked' },
  // Unavailable is NOT "no findings" (SPEC-0028 AC7) — it says so in words.
  UNAVAILABLE: { tone: 'gf-status-warn', glyph: '!', label: 'Unavailable' },
  RUNNING: { tone: 'gf-status-info', glyph: '●', label: 'Running' },

  // --- lifecycle ---------------------------------------------------------
  OPEN: { tone: 'gf-status-warn', glyph: '!', label: 'Open' },
  RESOLVED: { tone: 'gf-status-success', glyph: '✓', label: 'Resolved' },

  // --- triage ------------------------------------------------------------
  ACCEPTED: { tone: 'gf-status-info', glyph: '●', label: 'Accepted risk' },
  FALSE_POSITIVE: { tone: 'gf-status-pending', glyph: '○', label: 'False positive' },
  FIX: { tone: 'gf-status-warn', glyph: '!', label: 'Fix' },
  DEFER: { tone: 'gf-status-pending', glyph: '○', label: 'Deferred' },

  // --- merge-request review (T-0049, SPEC-0048 AC7/AC8) -------------------
  // Approve and request-changes are deliberately NOT the success/danger pair:
  // that is the encoding the diff view already refuses, and it is the pair a
  // deutan reader separates least well. The distinction that actually carries
  // is the glyph and the word — no two dispositions share either.
  APPROVED: { tone: 'gf-status-success', glyph: '✓', label: 'Approved' },
  CHANGES_REQUESTED: { tone: 'gf-status-warn', glyph: '↺', label: 'Changes requested' },
  COMMENTED: { tone: 'gf-status-info', glyph: '✎', label: 'Commented' },

  // --- evidence pack -----------------------------------------------------
  READY: { tone: 'gf-status-success', glyph: '✓', label: 'Ready' },
  // Assembly is in progress and the pack is not yet anything a reader should
  // trust. It is deliberately not PENDING: "queued" and "being built" are
  // different answers to "can I use this yet".
  ASSEMBLING: { tone: 'gf-status-info', glyph: '●', label: 'Assembling' },
  PENDING: { tone: 'gf-status-pending', glyph: '○', label: 'Pending' },
  FAILED: { tone: 'gf-status-danger', glyph: '✕', label: 'Failed' },

  // --- auditor grant lifecycle (T-0052, SPEC-0051 AC8) -------------------
  // These three render side by side in the grants list, so they are their own
  // distinctness set. ACTIVE against REVOKED is deliberately NOT the
  // success/danger pair: a revoked grant is a normal administrative outcome,
  // not a failure, and the pair a deutan reader separates least well should
  // not be carrying the product's access-control story.
  ACTIVE: { tone: 'gf-status-success', glyph: '✓', label: 'Active' },
  REVOKED: { tone: 'gf-status-warn', glyph: '!', label: 'Revoked' },
  EXPIRED: { tone: 'gf-status-pending', glyph: '○', label: 'Expired' },

  // --- CI job state (T-0061, SPEC-0054 AC12) -----------------------------
  // Succeeded and failed are deliberately not a green/red pair: it is the
  // pairing a deutan reader separates least well, and a pipeline list is read
  // by scanning down a column of exactly these two.
  //
  // RUNNING_JOB and FAILED_JOB carry the suffix because RUNNING and FAILED are
  // already taken by the scan and evidence-pack vocabularies, and one key
  // meaning two things in two contexts is how a badge quietly starts rendering
  // the wrong word.
  QUEUED: { tone: 'gf-status-pending', glyph: '○', label: 'Queued' },
  RUNNING_JOB: { tone: 'gf-status-info', glyph: '●', label: 'Running' },
  SUCCEEDED: { tone: 'gf-status-success', glyph: '✓', label: 'Succeeded' },
  FAILED_JOB: { tone: 'gf-status-warn', glyph: '!', label: 'Failed' },
  CANCELLED: { tone: 'gf-status-pending', glyph: '⊘', label: 'Cancelled' },

  // --- policy decision outcome (T-0063, SPEC-0055 AC8) -------------------
  // Allowed and denied are the pair a reader most expects in green and red,
  // and therefore the pair most worth refusing to render that way. A denial is
  // also not a failure — deny-by-default means most denials are the system
  // working — so it takes the muted tone rather than the danger one.
  ALLOWED: { tone: 'gf-status-success', glyph: '✓', label: 'Allowed' },
  DENIED: { tone: 'gf-status-pending', glyph: '⊘', label: 'Denied' },

  // --- release tag agreement (T-0066, SPEC-0056 AC11) --------------------
  // Neither is a failure: a tag being moved or deleted is a thing maintainers
  // do, and the release is still an accurate record of what it was published
  // against. They take the warn and muted tones rather than danger, because a
  // red badge here would read as "this release is broken" when what it
  // actually means is "the tag has moved on".
  TAG_MOVED: { tone: 'gf-status-warn', glyph: '!', label: 'Tag moved' },
  TAG_GONE: { tone: 'gf-status-pending', glyph: '⊘', label: 'Tag gone' },
  // --- archival (T-0070, SPEC-0057) ---------------------------------------
  // ARCHIVED is 'info', not 'warn': an archived repository is not degraded and
  // nothing about it needs attention. It is a decision someone recorded, and a
  // warning tone would tell a reader something is wrong. Its unarchived
  // counterpart is ACTIVE above — the same word for the same idea, reused
  // rather than duplicated with a second glyph, because two glyphs for one
  // state is how a vocabulary starts disagreeing with itself.
  ARCHIVED: { tone: 'gf-status-info', glyph: '▣', label: 'Archived' },

  // --- data plane state (T-0073, SPEC-0058 AC12) ---------------------------
  // STALE is not a shade of connected. SPEC-0038 AC8 says a stale plane is never
  // rendered as healthy, and these four are the distinctness set that has to
  // survive grayscale: an operator scanning this column is looking for the row
  // that stopped answering.
  //
  // NEVER_CONNECTED takes the pending tone and an open glyph because nothing has
  // happened yet — it is provisioned, not broken. REVOKED is a decision somebody
  // made, so it is warn rather than danger: the plane is not failing, it has been
  // turned off.
  PLANE_CONNECTED: { tone: 'gf-status-success', glyph: '◉', label: 'Connected' },
  PLANE_STALE: { tone: 'gf-status-danger', glyph: '✕', label: 'Stale' },
  PLANE_REVOKED: { tone: 'gf-status-warn', glyph: '!', label: 'Revoked' },
  PLANE_NEVER_CONNECTED: { tone: 'gf-status-pending', glyph: '○', label: 'Never connected' },
  // A state this frontend has never heard of. The status vocabulary is an open
  // string on the wire so a new plane state is additive rather than a coordinated
  // deploy — which means a reader can meet one, and it must read as "we do not
  // know what this is" rather than being folded into the nearest familiar state.
  PLANE_UNKNOWN: { tone: 'gf-status-pending', glyph: '?', label: 'Unknown state' },
};

const UNKNOWN: StatusDescriptor = {
  tone: 'gf-status-pending',
  glyph: '○',
  label: 'Unknown status',
};

/** Severity as a number, so ordering is a channel colour cannot carry. */
export function severityRank(key: StatusKey): number {
  return STATUS_VOCABULARY[key]?.rank ?? 0;
}

/**
 * Renders one status as its glyph, label and tone.
 *
 * An unrecognized key does NOT become a neutral grey badge: that is how a real
 * state disappears from a dashboard silently. It renders as "Unknown status",
 * which is visible and reportable.
 */
export function describeStatus(key: StatusKey): { text: string; tone: StatusDescriptor['tone']; descriptor: StatusDescriptor } {
  const d = STATUS_VOCABULARY[key] ?? UNKNOWN;
  const rank = d.rank ? ` ${d.rank}/4` : '';
  return { text: `${d.glyph} ${d.label}${rank}`, tone: d.tone, descriptor: d };
}

// --- the commercial surface (T-0048) -------------------------------------

/**
 * Envelope states. Three tints told these apart before ADR-0069; now each
 * carries a distinct glyph, and a test refuses two states sharing one — the
 * quickest way to put the whole distinction back into colour.
 *
 * None of these is a read-only condition and none ever becomes one: SPEC-0041
 * AC8's prohibition is unchanged here, and `readonly-cause` still owns it.
 */
export const ENVELOPE_STATUS = {
  WITHIN: { tone: 'gf-status-info', glyph: '●', label: 'Within envelope' },
  NEAR: { tone: 'gf-status-warn', glyph: '!', label: 'Near envelope' },
  EXCEEDED: { tone: 'gf-status-danger', glyph: '✕', label: 'Exceeded' },
} as const;

/**
 * Trend direction. An arrow is the shape channel; the word is the text one.
 * A trend rendered as muted grey prose was legible but invisible at a glance —
 * the arrow restores the glance without adding a hue.
 */
export const TREND = {
  RISING: { glyph: '↑', label: 'rising' },
  FALLING: { glyph: '↓', label: 'falling' },
  FLAT: { glyph: '→', label: 'flat' },
} as const;

/**
 * The Okabe-Ito eight, in the brand's fixed order (§4.5). Order matters even
 * though the set is colourblind-safe: a two-series chart takes the first two,
 * and blue-then-orange is the pair a deutan reader separates most easily.
 *
 * Charts must also vary dash pattern (see --gf-series-N-dash) so lines stay
 * separable with colour removed entirely.
 */
export const SERIES_ORDER = [
  '#0072B2', '#E69F00', '#009E73', '#D55E00', // gf-allow-hex: the palette itself, mirrored as --gf-series-N
  '#56B4E9', '#CC79A7', '#F0E442', '#000000', // gf-allow-hex: the palette itself, mirrored as --gf-series-N
] as const;
