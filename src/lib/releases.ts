// The releases surface (T-0066, SPEC-0056, ADR-0075's accepted increment).
//
// Two honesty rules live here.
//
// **The moved tag.** A release records the commit its tag pointed at when it
// was published. A tag is a mutable pointer, so the two can diverge — and the
// divergence is invisible unless someone says it. This is the only place in
// the product that compares a recorded fact with a live one, and the
// comparison is done HERE rather than in a backend because neither context is
// allowed to hold both facts: the Release context may not ask git what a tag
// means (ADR-0022), and Repository/Git knows nothing about releases.
//
// **The absent artifacts.** ADR-0075 accepted tags and notes only. The surface
// says no files are stored, and does not say "yet", "coming soon" or anything
// implying an upload is pending — each converts a decision nobody has taken
// into a promise somebody made.
import type { StatusKey } from './status';

export const RELEASE_MESSAGES = {
  noArtifacts:
    'A release here is a tag and the notes written about it. No files are stored and none can be attached — what a release names is a commit, and the notes describe it.',
  empty:
    'No releases are visible to you for this repository. That is not the same as none having been published — this page shows only what your access covers.',
  unavailable:
    'The releases could not be read. Nothing on this page describes what has been published.',
  tagMoved:
    'The tag now points at a different commit than it did when this release was published. What this release describes is the commit recorded below, not whatever the tag names today.',
  tagGone:
    'The tag no longer exists in this repository. The release still records the commit it was published against, and that record is what this page shows.',
  alreadyPublished:
    'That tag already has a release. A tag names one release, so publishing again would leave two records describing the same name.',
  published:
    'Published. The release below records the commit its tag pointed at just now.',
  notesUpdated:
    'The notes below are as they now stand. What the release points at is unchanged — only its prose was edited.',
  publishRefused:
    'That release was not published. Nothing here says why, because the answer we received says nothing about why.',
} as const;

export type ReleaseMessageKey = keyof typeof RELEASE_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function releaseMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(RELEASE_MESSAGES, key)
    ? RELEASE_MESSAGES[key as ReleaseMessageKey]
    : null;
}

/** What the tag says now, relative to what the release recorded. */
export type TagAgreement = 'agrees' | 'moved' | 'gone';

/**
 * Compares a release's recorded commit with the tag's current target.
 *
 * `gone` is deliberately distinct from `moved`: a deleted tag and a
 * repointed one are different things that happened, and collapsing them would
 * make the page tell one story about two events.
 */
export function tagAgreement(publishedCommit: string, currentCommit: string | undefined): TagAgreement {
  if (currentCommit === undefined) return 'gone';
  return currentCommit === publishedCommit ? 'agrees' : 'moved';
}

/** The status key for each agreement. `agrees` renders nothing — it is the unremarkable case. */
export function agreementStatusKey(agreement: TagAgreement): StatusKey | null {
  switch (agreement) {
    case 'moved':
      return 'TAG_MOVED';
    case 'gone':
      return 'TAG_GONE';
    default:
      return null;
  }
}
