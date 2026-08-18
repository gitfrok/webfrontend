// The code search surface's vocabulary and its index reading (T-0050, SPEC-0049).
//
// This file exists for one sentence in the contract: the empty page is the
// identical shape for a query that matched nothing and a query whose every
// match was unauthorized (SPEC-0035 AC4), and `SearchPage` carries no total
// because non-enumeration is a type property (AC3). The frontend is therefore
// told strictly less than a reader assumes it is, and the obvious copy —
// "No results found" — asserts non-existence it has no basis for. On an
// unauthorized query that assertion is the leak PR-19 forbids, inverted.
//
// A third meaning shares the same shape: the index is in-process and does not
// survive a data-plane restart (super-repo HANDOFF carried limit 12), so after
// one, every query returns an empty page. The status route is the only thing
// that tells the three apart, and an EMPTY entry list is its signal.
import type { IndexStatusPageView } from './bff';

export const SEARCH_MESSAGES = {
  empty:
    'This query returned nothing you can see. That is not the same as nothing existing — search never reports what is outside your access, and this page is not told the difference.',
  nothingIndexed:
    'The index currently holds no repositories, so a query has nothing to match against yet. Indexing resumes on its own.',
  indexStale:
    'The index is behind the repositories it covers, so a recent change may not appear yet.',
  indexUnknown:
    'The index state could not be read, so how current these results are is unknown. Nothing here says the index is empty — only that we could not ask.',
  refused:
    'That search did not run. Nothing here says why, because the answer we received says nothing about why.',
  modeRefused:
    'That search did not run. The query language must be one this build offers.',
} as const;

export type SearchMessageKey = keyof typeof SEARCH_MESSAGES;

/** Resolves a key that arrived over the wire, refusing anything not in the table. */
export function searchMessageForKey(key: string | null): string | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(SEARCH_MESSAGES, key)
    ? SEARCH_MESSAGES[key as SearchMessageKey]
    : null;
}

/**
 * How far behind the index may fall before the page says so.
 *
 * A display threshold only: nothing decides on it, no result is withheld
 * because of it, and the lag itself is rendered beside the word so a reader
 * who disagrees with the threshold can see the number.
 */
export const STALE_AFTER_MS = 5 * 60_000;

export type FreshnessKind = 'fresh' | 'stale' | 'nothing-indexed' | 'unknown';

export interface IndexFreshness {
  kind: FreshnessKind;
  /** The worst lag across repositories, or 0 when there is nothing to lag. */
  worstLagMS: number;
  repositoryCount: number;
}

/**
 * Reads the index status into one of four facts.
 *
 * `null` means the status read itself failed, and that is deliberately NOT
 * "nothing is indexed": one says the index is empty, the other says we could
 * not ask. Collapsing them would let a transient refusal render as a claim
 * about the index's contents.
 *
 * The worst lag wins, not the best or the mean. Reporting the best would
 * overstate how current the index is, and overstating is the direction that
 * misleads a reader into trusting a result set that is missing recent work.
 */
export function readIndexFreshness(status: IndexStatusPageView | null): IndexFreshness {
  if (!status) {
    return { kind: 'unknown', worstLagMS: 0, repositoryCount: 0 };
  }
  const entries = status.entries ?? [];
  if (entries.length === 0) {
    return { kind: 'nothing-indexed', worstLagMS: 0, repositoryCount: 0 };
  }
  const worstLagMS = entries.reduce((worst, entry) => Math.max(worst, entry.freshness_lag_ms ?? 0), 0);
  return {
    kind: worstLagMS > STALE_AFTER_MS ? 'stale' : 'fresh',
    worstLagMS,
    repositoryCount: entries.length,
  };
}

/** A lag as a phrase, so the threshold is never the only thing a reader has. */
export function describeLag(ms: number): string {
  if (ms < 1_000) return `${ms} ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 120) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}
