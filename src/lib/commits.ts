// Commit identity, and what a surface is allowed to say about it (T-0058,
// SPEC-0053 AC11).
//
// This is the phase's first honesty rule that is about an identity rather than
// an absence. A commit's author and committer are whatever the person running
// `git commit` had in their local config: git verifies neither, and anyone can
// commit as anyone. The platform *does* know who pushed — authenticated and
// audited — but that is a different field and frequently a different person: a
// merge, an import, a rebase, a cherry-pick, a script.
//
// "Who wrote this line" reads as an accountability claim, so a blame view that
// renders a name beside an avatar has asserted the platform stands behind it.
// It does not. Everything here exists to keep that assertion from being made
// by accident — the same line ADR-0029 draws for an imported declared_actor.
export const COMMIT_MESSAGES = {
  // Shown wherever git identity appears. It is not a disclaimer in the legal
  // sense; it is the difference between two facts the reader would otherwise
  // conflate.
  gitIdentityNote:
    'Names and addresses below come from the commits themselves. Git does not verify them and neither does this platform — they are not sign-in identities.',
  // Phrased so the unshown part is described as unexamined rather than as
  // empty. An earlier wording used the word "unattributed" to deny it, and the
  // AC12 check caught its own negation — the same way the repository list's
  // copy did. The check stays blunt; the copy avoids the word.
  blameCapped:
    'This file is longer than this view attributes. What is below covers the first part of it; the rest was not examined, so nothing here describes who touched those lines.',
  historyUnavailable:
    'The history could not be read. Nothing here describes what the history holds.',
  blameUnavailable:
    'The blame could not be read. Nothing here describes who touched these lines.',
} as const;

export type CommitMessageKey = keyof typeof COMMIT_MESSAGES;

/** The commit identity as the wire carries it — every field git's word. */
export interface CommitIdentityView {
  git_author_name: string;
  git_author_email: string;
  git_committer_name: string;
  git_committer_email: string;
  authored_at: string;
  committed_at: string;
}

/**
 * A short, display-safe rendering of a commit id.
 *
 * Seven characters is git's own abbreviation length. It is shortened for
 * reading, never for identity: every surface that shows one also carries the
 * full value in the markup so a reader can copy what git would accept.
 */
export function shortCommit(commitID: string): string {
  return commitID.slice(0, 7);
}

/**
 * A day, from an ISO instant, with no attempt at a relative phrasing.
 *
 * "3 days ago" is computed against the reader's clock and drifts with it; the
 * committed date is a fact in the commit. This surface shows the fact.
 */
export function commitDay(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}
