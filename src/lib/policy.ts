// Policy visibility (T-0063, SPEC-0055).
//
// Its honesty rule is the sharpest wording problem in the phase. Policy
// authoring is absent because ADR-0073 defers deciding what a tenant-authored
// policy even is — not because the reader lacks a role. Those two are
// indistinguishable from the outside, and every instinct of UI writing pushes
// toward the wrong one: a greyed-out button, a "contact your administrator", a
// "coming soon". Each tells the reader to go and ask someone, and there is
// nobody to ask.
//
// So the copy says where policy IS authored, plainly, and the AC6 enumeration
// refuses the alternatives.
export const POLICY_MESSAGES = {
  authoredInGovernance:
    'Policies are written and reviewed in the governance repository, and this page does not change them. That is where the rules for this platform live; nothing here is waiting on a permission you do not have.',
  bundleUnavailable:
    'The policy bundle in force could not be read, so this page cannot say which revision decided anything.',
  decisionUnavailable:
    'That decision could not be read. Nothing here says whether it exists.',
  noRevision:
    'This build does not report a bundle revision, so what is in force cannot be named here.',
} as const;

export type PolicyMessageKey = keyof typeof POLICY_MESSAGES;

/**
 * The evaluation mode, as a word.
 *
 * Dry-run matters to a reader: a decision taken in dry-run mode did not
 * enforce anything, and rendering it identically to an enforced one would
 * misrepresent what happened.
 */
export function modeLabel(wire: string): string {
  switch (wire) {
    case 'EVALUATION_MODE_ENFORCE':
      return 'enforced';
    case 'EVALUATION_MODE_DRY_RUN':
      return 'dry run — decided nothing';
    default:
      return 'unknown mode';
  }
}
