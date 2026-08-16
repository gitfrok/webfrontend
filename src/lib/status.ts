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
  // evidence pack
  | 'READY' | 'PENDING' | 'FAILED';

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

  // --- evidence pack -----------------------------------------------------
  READY: { tone: 'gf-status-success', glyph: '✓', label: 'Ready' },
  PENDING: { tone: 'gf-status-pending', glyph: '○', label: 'Pending' },
  FAILED: { tone: 'gf-status-danger', glyph: '✕', label: 'Failed' },
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
