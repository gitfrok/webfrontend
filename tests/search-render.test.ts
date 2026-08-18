// T-0050 / SPEC-0049 AC4, AC5, AC6, AC7, AC9, AC10 — what search is allowed to say.
//
// AC4 is the sharpest empty-state rule in the product. "No results found"
// asserts non-existence, and the frontend has no basis for that: the empty
// page is the identical shape for a query that matched nothing, a query whose
// every match was unauthorized, and — since the index is in-process and lost
// on restart — a query against an index that knows nothing.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SearchResults from '../src/components/SearchResults.astro';
import Layout from '../src/layouts/Layout.astro';
import { SEARCH_MESSAGES, readIndexFreshness, STALE_AFTER_MS } from '../src/lib/search';
import type { SearchResultView, IndexStatusPageView } from '../src/lib/bff';

const result = (path: string, metadata?: object): SearchResultView => ({
  repository_id: 'acme/web', revision: 'main', path,
  line_start: 10, line_end: 12, matched_content: 'func BuildQuery(',
  ...(metadata ? { metadata } : {}),
} as SearchResultView);

const fresh = (lag: number): IndexStatusPageView => ({
  entries: [
    { repository_id: 'acme/web', last_indexed_revision: 'abc1234', indexed_at: '2026-08-18T00:00:00Z', freshness_lag_ms: lag },
    { repository_id: 'acme/api', last_indexed_revision: 'def5678', indexed_at: '2026-08-18T00:00:00Z', freshness_lag_ms: 10 },
  ],
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(SearchResults, {
    props: { query: 'BuildQuery', results: [result('a.go')], nextPageToken: '', freshness: readIndexFreshness(fresh(10)), ...props },
  });
}

describe('SPEC-0049 AC4 — an empty page never says "no results"', () => {
  const forbidden = [
    'no results', 'no matches', 'nothing exists', '0 results', 'zero results',
    'not found', 'no such', 'nothing was found', 'were withheld', 'hidden results',
  ];

  it.each(Object.entries(SEARCH_MESSAGES))('%s asserts neither absence nor concealment', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const claim of forbidden) expect(lowered).not.toContain(claim);
  });

  it('renders the empty state as "nothing this query can show you"', async () => {
    const html = await render({ results: [] });
    expect(html).toContain(SEARCH_MESSAGES.empty);
  });

  it('makes no claim about absence or concealment anywhere on an empty page', async () => {
    const html = (await render({ results: [] })).toLowerCase();
    for (const claim of forbidden) expect(html).not.toContain(claim);
  });

  it('does not describe the empty page as a failure either', async () => {
    const html = (await render({ results: [] })).toLowerCase();
    for (const word of ['error', 'failed', 'unavailable']) expect(html).not.toContain(word);
  });
});

describe('SPEC-0049 AC5/AC6 — the index reading is its own fact', () => {
  it('reads populated, recent entries as fresh', () => {
    expect(readIndexFreshness(fresh(1_000)).kind).toBe('fresh');
  });

  it('reads the WORST lag across repositories, not the best or the mean', () => {
    // One stale repository makes the answer stale: reporting the best lag
    // would overstate how current the index is, which is the direction that
    // misleads.
    const reading = readIndexFreshness(fresh(STALE_AFTER_MS + 1));
    expect(reading.kind).toBe('stale');
    expect(reading.worstLagMS).toBe(STALE_AFTER_MS + 1);
  });

  it('reads an EMPTY entry list as "nothing is indexed", not as fresh', () => {
    // The index is in-process and lost on restart. An empty list is the
    // signal, and treating it as freshness data with zero lag would read as
    // a perfectly current index that knows nothing.
    const reading = readIndexFreshness({ entries: [] });
    expect(reading.kind).toBe('nothing-indexed');
  });

  it('reads a failed status read as unknown, never as "nothing is indexed"', () => {
    expect(readIndexFreshness(null).kind).toBe('unknown');
  });

  it('renders each of the four readings distinctly', async () => {
    const seen = new Set<string>();
    for (const reading of [
      readIndexFreshness(fresh(10)),
      readIndexFreshness(fresh(STALE_AFTER_MS + 1)),
      readIndexFreshness({ entries: [] }),
      readIndexFreshness(null),
    ]) {
      const html = await render({ results: [], freshness: reading });
      seen.add(html);
    }
    expect(seen.size).toBe(4);
  });

  it('says nothing is indexed in words, beside the empty state rather than instead of it', async () => {
    const html = await render({ results: [], freshness: readIndexFreshness({ entries: [] }) });
    expect(html).toContain(SEARCH_MESSAGES.empty);
    expect(html).toContain(SEARCH_MESSAGES.nothingIndexed);
  });

  it('does not claim the index state when the status read failed', async () => {
    const html = await render({ results: [], freshness: readIndexFreshness(null) });
    expect(html).toContain(SEARCH_MESSAGES.indexUnknown);
    expect(html).not.toContain(SEARCH_MESSAGES.nothingIndexed);
  });
});

describe('SPEC-0049 AC2/AC3/AC7 — results render as given', () => {
  it('keeps the backend order', async () => {
    const html = await render({ results: ['z.go', 'a.go', 'm.go'].map((p) => result(p)) });
    expect(html.indexOf('z.go')).toBeLessThan(html.indexOf('a.go'));
    expect(html.indexOf('a.go')).toBeLessThan(html.indexOf('m.go'));
  });

  it('renders a result whose enrichment metadata is absent', async () => {
    const html = await render({ results: [result('a.go')] });
    expect(html).toContain('a.go');
  });

  it('renders metadata when it is there', async () => {
    const html = await render({
      results: [result('a.go', { path: 'a.go', object_id: 'blob123', mode: 33188, size_bytes: 4096 })],
    });
    expect(html).toContain('4096');
  });

  it('renders the line span the backend returned', async () => {
    const html = await render({ results: [result('a.go')] });
    expect(html).toContain('10');
    expect(html).toContain('12');
  });

  it('renders no total, count or "of N" construction', async () => {
    const html = await render({ results: [result('a.go'), result('b.go')] });
    expect(html).not.toMatch(/\bof\s+\d+\b/);
    expect(html.toLowerCase()).not.toContain('showing');
    expect(html.toLowerCase()).not.toContain('total');
  });

  it('offers the next page only as the opaque token, never as a page number', async () => {
    const html = await render({ nextPageToken: 'opaque::42' });
    // Encoded into the href, not pasted: the token is opaque and may hold
    // anything the backend chose to put in it.
    expect(html).toContain(encodeURIComponent('opaque::42'));
    expect(html.toLowerCase()).not.toContain('page 2');
  });

  it('offers no next page when the token is empty', async () => {
    const html = await render({ nextPageToken: '' });
    expect(html.toLowerCase()).not.toContain('more results');
  });
});

describe('SPEC-0049 AC10 — Search is in the shell', () => {
  async function shell(path: string): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(Layout, { props: { title: 't' }, request: new Request(`http://app.gitsaas.test${path}`) });
  }

  it('appears exactly once and points at a page backed by a route', async () => {
    const html = await shell('/');
    expect(html.match(/>Search</g)?.length).toBe(1);
    expect(html).toContain('href="/search"');
  });

  it('marks itself current by aria-current when it is', async () => {
    const html = await shell('/search');
    expect(html).toMatch(/href="\/search"[^>]*aria-current="page"/);
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });
});
