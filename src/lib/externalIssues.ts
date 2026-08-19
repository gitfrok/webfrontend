// External issue references on a merge request (T-0076, SPEC-0059, ADR-0074's
// accepted scope).
//
// Two rules live here, and both are about not lying to a reader.
//
// **A reference is a pointer, not a copy.** This product stores no issue: no title,
// no state, no assignee. It never asks the tracker anything, so the page cannot say
// whether an issue is open — and does not imply it can.
//
// **A link out of the product shows where it goes.** The host is rendered beside the
// key, and a URL that is not https is rendered as text rather than as a link. The
// backend refuses those too; this is the second refusal, because the first one being
// there is not a reason for a browser to trust what it was handed.

export const EXTERNAL_ISSUE_MESSAGES = {
  whatThisIs:
    'These are pointers to issues in your own tracker. This product stores no issue: it records which tracker, which issue, and where it is — and it never asks the tracker anything, so nothing here says whether an issue is open.',
  mergingClosesNothing:
    'Merging this request does not close anything. Closing an issue happens in the tracker, by whoever manages it.',
  empty:
    'This merge request references no issues. Add one by naming the tracker, the issue key and its https address.',
  refused:
    'That reference was not added. Nothing here says why, because the answer we received says nothing about why.',
  invalid:
    'A reference needs a tracker, an issue key, and an https address. Nothing was changed.',
  full:
    'This merge request already carries as many issue references as it can. Remove one before adding another.',
  linked: 'Added. The reference below points at the issue in your tracker.',
  unlinked: 'Removed. Nothing else about this merge request changed.',
  unsafeURL:
    'This reference was stored with an address that is not https, so it is shown as text rather than as a link.',
} as const;

export type ExternalIssueMessageKey = keyof typeof EXTERNAL_ISSUE_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function externalIssueMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(EXTERNAL_ISSUE_MESSAGES, key)
    ? EXTERNAL_ISSUE_MESSAGES[key as ExternalIssueMessageKey]
    : null;
}

/**
 * Whether a stored URL may become an `href`.
 *
 * Absolute https only. A `javascript:` or `data:` URL is the attack; a `http:` or
 * relative one is a mistake — all four are rendered as text instead, because the
 * product is not going to be the thing that hands a reader a hostile link.
 *
 * The backend refuses these before storing, so this should never fire. That is
 * exactly why it is here: a control that only matters when something upstream has
 * already failed is the one worth having.
 */
export function isSafeIssueURL(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The host a reference points at, for rendering beside the key.
 *
 * A reader should be able to see where a link goes before clicking it. An
 * unparseable URL has no host to show, and the caller renders it as text.
 */
export function issueHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
