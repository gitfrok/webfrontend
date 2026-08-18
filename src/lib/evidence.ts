// The evidence pack surface's vocabulary and copy (T-0051, SPEC-0050).
//
// The copy lives in one table for the same reason the merge-request copy does:
// a string written inline in a component is a string the AC6 enumeration never
// reads. On this surface there is a second reason. AC4 forbids any claim that a
// pack is complete when no final chunk arrived, and "complete" is a word that
// creeps into UI copy without anyone deciding it should.
import { describeStatus, STATUS_VOCABULARY, type StatusDescriptor, type StatusKey } from './status';

export const EVIDENCE_MESSAGES = {
  truncated:
    'This pack is incomplete. The stream ended without the marker that closes it, so what is shown below is not authoritative and must not be relied on as a record of the period.',
  refused:
    'This pack could not be read. Nothing here says why, because the answer we received says nothing about why.',
  sectionIncomplete:
    'This section is incomplete — it is missing records for the periods named below, or the server did not claim it whole.',
  assembling:
    'This pack is still being assembled. Reload to see where it has got to; nothing is authoritative until it is ready.',
  requestRefused:
    'That request did not take effect. Nothing here says why, because the answer we received says nothing about why.',
} as const;

export type EvidenceMessageKey = keyof typeof EVIDENCE_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function evidenceMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(EVIDENCE_MESSAGES, key)
    ? EVIDENCE_MESSAGES[key as EvidenceMessageKey]
    : null;
}

/**
 * The four pack states, in lifecycle order. PENDING and ASSEMBLING are told
 * apart because they answer "can I use this yet" differently: one is queued,
 * one is being built, and collapsing them would hide the difference behind a
 * single spinner.
 */
export const PACK_STATES = ['PENDING', 'ASSEMBLING', 'READY', 'FAILED'] as const;

export type PackState = (typeof PACK_STATES)[number];

/** One pack state's glyph, word and token class, through the one vocabulary. */
export function describePackState(state: string): StatusDescriptor & { text: string } {
  const known = (PACK_STATES as readonly string[]).includes(state);
  const described = describeStatus((known ? state : 'NOT_A_STATE') as StatusKey);
  return { ...described.descriptor, text: described.text };
}

/** True when the state is one this build knows. */
export function isKnownPackState(state: string): state is PackState {
  return Object.prototype.hasOwnProperty.call(STATUS_VOCABULARY, state) &&
    (PACK_STATES as readonly string[]).includes(state);
}
