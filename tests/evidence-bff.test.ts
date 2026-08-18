// T-0051 / SPEC-0050 AC1, AC2, AC6 — the evidence pack clients.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestEvidencePack, evidencePackStatus, evidencePackStream } from '../src/lib/bff';

const request = () =>
  new Request('http://app.gitsaas.test/compliance/evidence-packs', {
    headers: { cookie: '__Host-gitfrok_session=abc' },
  });

const statusView = {
  state: 'READY',
  sections: [{ type: 'APPROVALS', record_count: 12, gaps: [] }],
  appendix_record_count: 0,
  range_from: '2026-07-01T00:00:00Z',
  range_to: '2026-08-01T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

describe('SPEC-0050 AC1 — requesting a pack', () => {
  it('posts a closed range as RFC3339 JSON with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pack_id: 'pack-1', state: 'PENDING' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestEvidencePack(request(), {
      range_from: '2026-07-01T00:00:00Z',
      range_to: '2026-08-01T00:00:00Z',
      repository_id: 'acme/web',
    });

    expect(result.pack_id).toBe('pack-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/audit/evidence-packs');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      range_from: '2026-07-01T00:00:00Z',
      range_to: '2026-08-01T00:00:00Z',
      repository_id: 'acme/web',
    });
  });

  it('omits an absent repository scope rather than sending an empty one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pack_id: 'p', state: 'PENDING' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await requestEvidencePack(request(), {
      range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z', repository_id: '',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect('repository_id' in body).toBe(false);
  });

  it.each([
    ['an unparseable from', 'not-a-date', '2026-08-01T00:00:00Z'],
    ['an unparseable to', '2026-07-01T00:00:00Z', 'soon'],
    ['an open range', '2026-07-01T00:00:00Z', ''],
    ['an inverted range', '2026-08-01T00:00:00Z', '2026-07-01T00:00:00Z'],
    ['an empty range', '', ''],
  ])('refuses %s before compiling a request', async (_name, from, to) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      requestEvidencePack(request(), { range_from: from, range_to: to, repository_id: '' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('evidence unavailable', { status: 404 })));
    await expect(
      requestEvidencePack(request(), {
        range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z', repository_id: '',
      }),
    ).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0050 AC2 — watching assembly', () => {
  it('reads the status and passes it through untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(statusView), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await evidencePackStatus(request(), 'pack-1');
    expect(result).toEqual(statusView);
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/audit/evidence-packs/pack-1/status');
  });

  it('encodes the pack identifier rather than pasting it into the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(statusView), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await evidencePackStatus(request(), 'pack/one two');
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/audit/evidence-packs/pack%2Fone%20two/status');
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(evidencePackStatus(request(), 'pack-1')).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0050 AC3 — the stream client never throws on a truncated pack', () => {
  it('returns the truncated result rather than raising, so the page can say so', async () => {
    // Raising here would collapse "the pack is incomplete" into the same
    // coarse failure as "there is no pack", and those are different facts.
    const body = `${JSON.stringify({ chunk_index: 0, final_chunk: false })}\n`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson' } }),
    ));
    const result = await evidencePackStream(request(), 'pack-1');
    expect(result.truncated).toBe(true);
    expect(result.refused).toBe(false);
  });

  it('reports a refused stream as refused AND truncated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const result = await evidencePackStream(request(), 'pack-1');
    expect(result.refused).toBe(true);
    expect(result.truncated).toBe(true);
  });
});
