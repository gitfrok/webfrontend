// The pipeline runs surface (T-0061, SPEC-0054).
//
// Its honesty rule is an absence that has to be *said*. ADR-0072 delivers runs
// and defers job logs to their own decision, so this surface shows that a job
// failed and cannot show why. To anyone who has used a forge that reads as
// "the logs are elsewhere on this page" — so the page says they are not
// anywhere, once, where a reader looking for them will be.
//
// "Coming soon" is specifically forbidden. It converts a decision that has not
// been taken into a promise that has, and the AC11 enumeration refuses it.
import type { StatusKey } from './status';

export const PIPELINE_MESSAGES = {
  noOutputRetained:
    'Job output is not kept. These runs record what happened and when; the logs a job produced were never stored, so there is nothing here to open and nowhere else to look for them.',
  empty:
    'No runs are visible to you here. That is not the same as none having happened — this page shows only what your access covers.',
  unavailable:
    'The runs could not be read. Nothing on this page describes what has run.',
} as const;

export type PipelineMessageKey = keyof typeof PIPELINE_MESSAGES;

/**
 * Maps the wire's job state onto the status vocabulary.
 *
 * The wire sends protobuf enum names. An unrecognised one becomes the unknown
 * badge rather than a neutral grey one: a state this build does not know is a
 * state a reader must be able to see is unaccounted for.
 */
export function jobStateKey(wire: string): StatusKey {
  switch (wire) {
    case 'JOB_STATE_QUEUED':
      return 'QUEUED';
    case 'JOB_STATE_RUNNING':
      return 'RUNNING_JOB';
    case 'JOB_STATE_SUCCEEDED':
      return 'SUCCEEDED';
    case 'JOB_STATE_FAILED':
      return 'FAILED_JOB';
    case 'JOB_STATE_CANCELLED':
      return 'CANCELLED';
    default:
      return 'NOT_A_JOB_STATE' as StatusKey;
  }
}

/** The trigger, as a word rather than an enum name. */
export function triggerLabel(wire: string): string {
  switch (wire) {
    case 'JOB_TRIGGER_KIND_REF_UPDATED':
      return 'push';
    case 'JOB_TRIGGER_KIND_MERGE_REQUEST':
      return 'merge request';
    case 'JOB_TRIGGER_KIND_MANUAL':
      return 'manual';
    default:
      return 'unknown trigger';
  }
}

/**
 * The CSS class carrying a job state's own glyph, where its tone's glyph would
 * collide with a sibling's.
 *
 * Queued and cancelled both sit on the muted tone, so without this they would
 * share the hollow circle as well — in the one column a reader scans down. The
 * grant list already sets this precedent: states rendered side by side get
 * pairwise-distinct shapes, not just distinct words.
 */
export function jobStateGlyphClass(key: string): string {
  return key === 'CANCELLED' ? 'gf-jobstate-cancelled' : '';
}
