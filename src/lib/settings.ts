// The repository settings surface (T-0070, SPEC-0057, ADR-0076's accepted increment).
//
// Two rules live here, and both are about absence.
//
// **What is not a setting.** ADR-0076 accepted name, description and archival.
// Visibility and membership are not missing features on this page — they are
// authorization models this product has not decided, and branch protection and
// approval requirements are policy by PR-10, not toggles. So the page states
// that, and the copy table below is what a test asserts against: a disabled
// control would tell a reader they lack a permission, and they do not.
//
// **What archival does.** Archiving labels a repository. It does not make it
// read-only, does not hide it from a list, and does not narrow a read. A reader
// who takes the label for a lock has been misled by us, so the page says what
// it does and does not do in the same breath.
import type { StatusKey } from './status';

export const SETTINGS_MESSAGES = {
  scope:
    'A repository here has a name, a description, and an archived state. Every change is recorded in the audit trail with who made it and when.',
  notSettings:
    'Visibility and membership are not repository settings in this product. Access is decided per tenant, and every read is authorized server-side. Branch protection and approval requirements are policy, held in governance and enforced server-side — they are not toggles on this page.',
  noDeletion:
    'A repository cannot be deleted from this page. What a deletion would have to remove reaches audit records, evidence packs and findings, and that is a decision nobody has taken.',
  archivedMeaning:
    'This repository is archived. It is still listed, still readable, and still writable — archiving records a decision about the repository, it does not restrict it.',
  activeMeaning:
    'This repository is not archived. Archiving records that a repository is finished with; it does not restrict who may read or write it.',
  unavailable:
    'The settings could not be read. Nothing on this page describes how this repository is configured.',
  saved:
    'Saved. The settings below are as they now stand, and the change is in the audit trail.',
  nameRequired:
    'A repository needs a name. Nothing was changed — the name you sent was empty.',
  refused:
    'That change was not made. Nothing here says why, because the answer we received says nothing about why.',
  archived:
    'Archived. The repository is still listed, still readable and still writable.',
  unarchived:
    'No longer archived. Nothing else about the repository changed.',
} as const;

export type SettingsMessageKey = keyof typeof SETTINGS_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function settingsMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(SETTINGS_MESSAGES, key)
    ? SETTINGS_MESSAGES[key as SettingsMessageKey]
    : null;
}

/**
 * Whether a repository carries the archived label.
 *
 * The instant IS the state: there is no boolean beside it that could disagree
 * with it, at any layer between the column and here.
 */
export function isArchived(archivedAt: string | undefined): boolean {
  return typeof archivedAt === 'string' && archivedAt !== '';
}

/** The status key for the archived state. Both states render: an absent label would read as unknown. */
export function archivalStatusKey(archivedAt: string | undefined): StatusKey {
  return isArchived(archivedAt) ? 'ARCHIVED' : 'ACTIVE';
}

/**
 * What the archived state means, in words.
 *
 * Both readings are stated rather than only the archived one, because the risk
 * runs the other way too: a reader who has seen archiving lock a repository
 * elsewhere will assume it does here.
 */
export function archivalMeaning(archivedAt: string | undefined): string {
  return isArchived(archivedAt) ? SETTINGS_MESSAGES.archivedMeaning : SETTINGS_MESSAGES.activeMeaning;
}
