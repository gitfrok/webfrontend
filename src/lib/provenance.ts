// Provenance rendering rules (SPEC-0011 AC23, ADR-0029, ADR-0015).
//
// An MR view mixes history this platform witnessed with history a migration
// declared. The two must never read the same. These are pure functions rather
// than markup so the distinction is testable on its own: a page that renders an
// imported approval as a platform approval is a governance failure, not a
// styling one, and it should be caught by a unit test and not by a screenshot.
//
// The rules are deliberately one-directional: everything that is not provably
// first-party renders as unverified. A record whose class the BFF could not name
// arrives as UNSPECIFIED, and it is presented as imported-or-unknown — never as
// platform history (ADR-0029 §1 forbids an implicit first-party default).

export const CLASS_UNSPECIFIED = 'UNSPECIFIED';
export const CLASS_FIRST_PARTY = 'FIRST_PARTY';
export const CLASS_ATTESTED_IMPORT = 'ATTESTED_IMPORT';

export const ANCHOR_UNSPECIFIED = 'UNSPECIFIED';
export const ANCHOR_DIFF = 'DIFF';
export const ANCHOR_FILE = 'FILE';
export const ANCHOR_MERGE = 'MERGE';

export interface ProvenanceView {
  class: string;
  import_id: string;
  source_system: string;
  source_instance: string;
  source_ref: string;
  declared_actor: string;
  declared_at: string | null;
  payload_digest: string;
}

export interface ImportedCommentView {
  comment_id: string;
  declared_actor: string;
  body: string;
  declared_at: string | null;
  provenance: ProvenanceView;
}

export interface ImportedThreadView {
  thread_id: string;
  merge_request_id: string;
  path: string;
  anchor: string;
  approximate: boolean;
  comments: ImportedCommentView[];
  provenance: ProvenanceView;
}

export interface ImportedApprovalView {
  approval_id: string;
  merge_request_id: string;
  declared_actor: string;
  declared_at: string | null;
  provenance: ProvenanceView;
  satisfies_policy: boolean;
}

export interface ImportedMergeRequestView {
  merge_request_id: string;
  source_ref: string;
  target_ref: string;
  title: string;
  description: string;
  state: string;
  declared_creator: string;
  threads: ImportedThreadView[];
  approvals: ImportedApprovalView[];
  provenance: ProvenanceView;
}

export interface ImportedHistoryView {
  merge_requests: ImportedMergeRequestView[];
  next_page_token: string;
}

// isFirstParty is true only for a record explicitly classified FIRST_PARTY.
// Everything else — imported, unspecified, or a class this build has never heard
// of — is not platform history and must not be rendered as such.
export function isFirstParty(provenance: ProvenanceView | undefined | null): boolean {
  return provenance?.class === CLASS_FIRST_PARTY;
}

// isImported is true for a record this platform did not witness. It is the
// negation of isFirstParty on purpose: a missing or unreadable provenance block
// renders as imported, because the alternative is presenting unattested history
// as verified.
export function isImported(provenance: ProvenanceView | undefined | null): boolean {
  return !isFirstParty(provenance);
}

// originLabel is the badge text beside an imported record. It names the source
// instance, so a reader sees where the record came from rather than only that it
// is "imported".
export function originLabel(provenance: ProvenanceView | undefined | null): string {
  if (isFirstParty(provenance)) return '';
  const instance = provenance?.source_instance || provenance?.source_system;
  return instance ? `Imported from ${instance}` : 'Imported — source unknown';
}

// declaredActorLabel presents the source's own handle as a foreign handle: never
// a link, never a platform username, and always accompanied by the instance it
// came from (SPEC-0011 AC14).
export function declaredActorLabel(provenance: ProvenanceView | undefined | null, declaredActor = ''): string {
  const actor = declaredActor || provenance?.declared_actor || '';
  const instance = provenance?.source_instance || provenance?.source_system || 'an unnamed source';
  if (!actor) return `an unidentified account on ${instance}`;
  return `${actor} (on ${instance})`;
}

// declaredAtLabel renders a source-declared date as declared, never as a
// platform timestamp. An absent date says so rather than showing the epoch.
export function declaredAtLabel(declaredAt: string | null | undefined): string {
  if (!declaredAt) return 'no date declared';
  const at = new Date(declaredAt);
  if (Number.isNaN(at.getTime())) return 'no date declared';
  return `declared ${at.toISOString().slice(0, 10)}`;
}

export interface ApprovalPresentation {
  // label is what the reader sees.
  label: string;
  // counts is whether this approval satisfies the merge policy. For an imported
  // approval it is always false: the BFF says so, and this function does not
  // recompute it (SPEC-0011 AC13).
  counts: boolean;
  // toneUnverified marks the record for the unverified visual treatment.
  toneUnverified: boolean;
}

// approvalPresentation is the load-bearing rule of AC23. An imported approval
// says, in words, that it is not a platform approval and does not count toward
// the merge policy. It is never rendered with the same affordance as a
// first-party approval, and its declared actor is never presented as an approver.
export function approvalPresentation(approval: ImportedApprovalView): ApprovalPresentation {
  const counts = isFirstParty(approval.provenance) && approval.satisfies_policy;
  if (counts) {
    return { label: `Approved by ${approval.declared_actor}`, counts: true, toneUnverified: false };
  }
  return {
    label:
      `Imported approval by ${declaredActorLabel(approval.provenance, approval.declared_actor)}, ` +
      `${declaredAtLabel(approval.declared_at ?? approval.provenance?.declared_at)} — ` +
      'not a platform approval and does not satisfy this merge policy',
    counts: false,
    toneUnverified: true,
  };
}

// anchorNote explains a degraded anchor in the reader's terms. A thread that no
// longer points at a diff position must not be drawn as though it does
// (SPEC-0011 AC5).
export function anchorNote(thread: ImportedThreadView): string {
  if (!thread.approximate && thread.anchor === ANCHOR_DIFF) return '';
  switch (thread.anchor) {
    case ANCHOR_FILE:
      return 'Approximate location: the original diff position no longer resolves, so this thread is attached to the file.';
    case ANCHOR_MERGE:
      return 'Approximate location: the original file is no longer present, so this thread is attached to the merge request.';
    default:
      return 'Approximate location: the source did not declare where this thread was anchored.';
  }
}

// countedApprovals counts only approvals that satisfy the merge policy, so an
// import can never inflate the number a reader sees. It is the one place the
// page is allowed to count approvals at all.
export function countedApprovals(approvals: ImportedApprovalView[]): number {
  return approvals.filter((approval) => approvalPresentation(approval).counts).length;
}

export interface TimelineEntry {
  id: string;
  imported: boolean;
  author: string;
  body: string;
  when: string;
  note: string;
  path: string;
}

// importedTimeline flattens an imported MR's threads into renderable entries,
// each carrying its own imported flag. Imported history is never merged into a
// first-party list untagged: every entry states its own origin, so a page cannot
// lose the distinction by concatenating two arrays.
export function importedTimeline(record: ImportedMergeRequestView): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const thread of record.threads ?? []) {
    const note = anchorNote(thread);
    for (const comment of thread.comments ?? []) {
      entries.push({
        id: comment.comment_id,
        imported: isImported(comment.provenance),
        author: declaredActorLabel(comment.provenance, comment.declared_actor),
        body: comment.body,
        when: declaredAtLabel(comment.declared_at ?? comment.provenance?.declared_at),
        note,
        path: thread.path,
      });
    }
  }
  return entries;
}
