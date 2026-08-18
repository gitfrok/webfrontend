// T-0050 / SPEC-0049 AC1, AC2, AC3, AC7, AC8 — the code search clients.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCode, searchIndexStatus, SEARCH_MODES } from '../src/lib/bff';

const request = () =>
  new Request('http://app.gitsaas.test/search', { headers: { cookie: '__Host-gitfrok_session=abc' } });

const result = (path: string) => ({
  repository_id: 'acme/web', revision: 'main', path,
  line_start: 10, line_end: 12, matched_content: 'func BuildQuery(',
});

afterEach(() => vi.restoreAllMocks());

describe('SPEC-0049 AC1 — running a query', () => {
  it('posts the query as JSON with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [result('a.go')], next_page_token: 'tok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await searchCode(request(), { query: 'BuildQuery', mode: 'SUBSTRING', page_token: '' });

    expect(page.results.length).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/search/query');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe('BuildQuery');
    expect(body.mode).toBe('SUBSTRING');
    // A query carries no repository field — scope is server-derived, and a
    // request cannot assert it (SPEC-0035 AC2).
    for (const forbidden of ['repository_id', 'repositories', 'tenant_id', 'actor_id', 'scope']) {
      expect(forbidden in body).toBe(false);
    }
  });

  it('carries all three contract modes and nothing else', () => {
    expect([...SEARCH_MODES]).toEqual(['SUBSTRING', 'REGEX', 'SYMBOL']);
  });

  it('refuses a mode the contract does not name, before compiling a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      searchCode(request(), { query: 'x', mode: 'FUZZY' as never, page_token: '' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty query rather than asking the backend what nothing matches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchCode(request(), { query: '   ', mode: 'SUBSTRING', page_token: '' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the query text verbatim, including a regex', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [], next_page_token: '' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await searchCode(request(), { query: '^func\\s+\\w+\\(', mode: 'REGEX', page_token: '' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).query).toBe('^func\\s+\\w+\\(');
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(searchCode(request(), { query: 'x', mode: 'SUBSTRING', page_token: '' })).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0049 AC2/AC3/AC7 — the page passes through', () => {
  it('preserves the backend order exactly', async () => {
    const order = ['z.go', 'a.go', 'm.go'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: order.map(result), next_page_token: '' }), { status: 200 }),
    ));
    const page = await searchCode(request(), { query: 'x', mode: 'SUBSTRING', page_token: '' });
    expect(page.results.map((r) => r.path)).toEqual(order);
  });

  it('reads an absent results array as an empty page, never as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    const page = await searchCode(request(), { query: 'x', mode: 'SUBSTRING', page_token: '' });
    expect(page.results).toEqual([]);
    expect(page.next_page_token).toBe('');
  });

  it('carries no total, because the contract has no field for one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [result('a.go')], next_page_token: '', total: 99 }), { status: 200 }),
    ));
    const page = await searchCode(request(), { query: 'x', mode: 'SUBSTRING', page_token: '' });
    // Even if something upstream invented one, it is not part of the shape
    // this layer renders. Non-enumeration is a type property (SPEC-0035 AC3).
    expect('total' in (page as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('SPEC-0049 AC8 — paging follows the token', () => {
  it('sends the token verbatim and computes no offset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [], next_page_token: '' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await searchCode(request(), { query: 'x', mode: 'SUBSTRING', page_token: 'opaque::42' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.page_token).toBe('opaque::42');
    for (const forbidden of ['offset', 'page', 'page_number', 'skip', 'from']) {
      expect(forbidden in body).toBe(false);
    }
  });
});

describe('SPEC-0049 AC5/AC6 — index status', () => {
  it('reads the freshness entries and passes them through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        entries: [{ repository_id: 'acme/web', last_indexed_revision: 'abc', indexed_at: '2026-08-18T00:00:00Z', freshness_lag_ms: 4000 }],
      }), { status: 200 }),
    ));
    const status = await searchIndexStatus(request());
    expect(status.entries.length).toBe(1);
    expect(status.entries[0].freshness_lag_ms).toBe(4000);
  });

  it('reads an absent entries array as an EMPTY list — the "nothing is indexed" signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    const status = await searchIndexStatus(request());
    expect(status.entries).toEqual([]);
  });

  it('throws on a refusal, so an unreadable index is never mistaken for an empty one', async () => {
    // These are different facts. Collapsing them would let "we could not ask"
    // render as "nothing is indexed" (SPEC-0049 AC6).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(searchIndexStatus(request())).rejects.toThrow(/unavailable/i);
  });
});
