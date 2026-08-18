// Merge-request write outcomes and the review disposition vocabulary
// (T-0049, SPEC-0048 AC4–AC8).
//
// This file exists because of one property of the BFF: every failed write
// returns the same coarse 404 — `merge request unavailable` — for a dead
// session, an unknown repository, a policy refusal, a stale version and a
// merge the gate rejected alike (SPEC-0001, and `denied()` in the BFF's mr
// handler). The surface therefore knows exactly one fact about a failure:
// that the action did not take effect. Every message it can render lives in
// one table so a test can walk the whole set, because the natural copy for a
// failed merge — "you do not have permission to merge" — is a claim this
// layer has no evidence for.
import type { MergeRequestView } from './bff';
import { STATUS_VOCABULARY, type StatusDescriptor, type StatusKey } from './status';

/**
 * Every string this surface can render about a write. The table is the
 * enforcement point: a message written inline in a component is a message no
 * test has read.
 */
export const MR_ACTION_MESSAGES = {
  applied: 'The merge request below is as it now stands.',
  stale:
    'This merge request changed since you loaded it. Nothing was submitted against the newer version — the current state is shown below.',
  notApplied:
    'That did not take effect. Nothing here says why, because the answer we received says nothing about why.',
  rereadFailed:
    'That did not take effect, and the merge request could not be re-read afterwards. What is shown below may be out of date.',
} as const;

export type WriteOutcomeKind = 'applied' | 'stale' | 'not-applied';

export interface WriteOutcome {
  kind: WriteOutcomeKind;
  /** The key into MR_ACTION_MESSAGES — what travels in the redirect. */
  messageKey: MRActionMessageKey;
  message: string;
  /** The state as last read. Null when the re-read itself failed. */
  current: MergeRequestView | null;
}

export type MRActionMessageKey = keyof typeof MR_ACTION_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function messageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(MR_ACTION_MESSAGES, key)
    ? MR_ACTION_MESSAGES[key as MRActionMessageKey]
    : null;
}

/**
 * Classifies a refused write by re-reading the merge request.
 *
 * A version higher than the one submitted is direct evidence the merge request
 * moved, which is a fact worth telling the reader — it changes what they should
 * do next. Anything else is not evidence of anything: an equal version, a
 * version that appears to have gone backwards, and a re-read that failed all
 * collapse to "did not take effect", because inventing a cause here would be
 * the same unsupported claim AC4 forbids.
 */
export function classifyWriteOutcome(input: {
  submittedVersion: number;
  reread: MergeRequestView | null;
}): WriteOutcome {
  const { submittedVersion, reread } = input;
  if (!reread) {
    return { kind: 'not-applied', messageKey: 'rereadFailed', message: MR_ACTION_MESSAGES.rereadFailed, current: null };
  }
  if (reread.version > submittedVersion) {
    return { kind: 'stale', messageKey: 'stale', message: MR_ACTION_MESSAGES.stale, current: reread };
  }
  return { kind: 'not-applied', messageKey: 'notApplied', message: MR_ACTION_MESSAGES.notApplied, current: reread };
}

/** The three dispositions `codereview/v1` defines, and how each renders. */
export const MR_DISPOSITIONS = {
  APPROVE: 'APPROVED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
  COMMENT: 'COMMENTED',
} as const satisfies Record<string, StatusKey>;

export type MRDisposition = keyof typeof MR_DISPOSITIONS;

/**
 * A disposition's glyph, word and token class — resolved through the one
 * status vocabulary, so the existing enumeration test covers these members and
 * a fourth disposition added later with a hue and nothing else fails on the day
 * it is written (ADR-0069 law 2).
 */
export function describeDisposition(key: MRDisposition): StatusDescriptor {
  return STATUS_VOCABULARY[MR_DISPOSITIONS[key]];
}

/**
 * The CSS class carrying a disposition's own glyph.
 *
 * The status pill takes its glyph from its tone class, and three dispositions
 * on three tones would inherit three glyphs that mean something else. These
 * classes override it, so the shape channel says "approved", not "success".
 */
export function dispositionGlyphClass(key: MRDisposition): string {
  return {
    APPROVE: 'gf-disposition-approve',
    REQUEST_CHANGES: 'gf-disposition-request-changes',
    COMMENT: 'gf-disposition-comment',
  }[key];
}
