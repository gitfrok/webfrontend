// The auditor grant surface's vocabulary and copy (T-0052, SPEC-0051).
//
// The rule that shapes this file: **the server's record is the fact.** A
// grant's state is read at decision time (SPEC-0033 AC7), so nothing here
// derives one. There is deliberately no function that takes an `expires_at`
// and returns a state — the obvious helper is the bug, because it would render
// a grant expired while the server still honours it, or the reverse.
import { describeStatus, type StatusDescriptor, type StatusKey } from './status';

export const GRANT_MESSAGES = {
  noGrants: 'No grants to show for this tenant.',
  issued: 'The grant below is as the server issued it.',
  revoked: 'The grant below is as it now stands.',
  notApplied:
    'That did not take effect. Nothing here says why, because the answer we received says nothing about why.',
  unavailable:
    'The grants for this tenant could not be read. This is not a statement that there are none.',
  expiryIsRequested:
    'The expiry you ask for is a request. The server may bound it, and the grant shown afterwards carries the expiry it actually recognized.',
} as const;

export type GrantMessageKey = keyof typeof GRANT_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function grantMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(GRANT_MESSAGES, key)
    ? GRANT_MESSAGES[key as GrantMessageKey]
    : null;
}

/** The three lifecycle states the contract names. */
export const GRANT_STATES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;

export type GrantState = (typeof GRANT_STATES)[number];

/**
 * One grant state's glyph, word and token class.
 *
 * A state this build does not know renders as unknown rather than as a neutral
 * badge: a grant whose state disappeared from the UI is a grant nobody revokes.
 */
export function describeGrantState(state: string): StatusDescriptor & { text: string } {
  const known = (GRANT_STATES as readonly string[]).includes(state);
  const described = describeStatus((known ? state : 'NOT_A_GRANT_STATE') as StatusKey);
  return { ...described.descriptor, text: described.text };
}
