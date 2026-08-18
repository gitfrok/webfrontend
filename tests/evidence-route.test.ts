// T-0051 / SPEC-0050 AC1 — the SSR request relay.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { POST } from '../src/pages/api/compliance/evidence-packs/index';

function context(fields: Record<string, string>): APIContext {
  const request = new Request('http://app.gitsaas.test/api/compliance/evidence-packs', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: '__Host-gitfrok_session=abc' },
    body: new URLSearchParams(fields).toString(),
  });
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
  return { request, redirect } as unknown as APIContext;
}

const location = (r: Response) => r.headers.get('location') ?? '';

afterEach(() => vi.restoreAllMocks());

describe('POST /api/compliance/evidence-packs', () => {
  it('turns the form days into RFC3339 instants and redirects to the new pack', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pack_id: 'pack-9', state: 'PENDING' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(context({ range_from: '2026-07-01', range_to: '2026-08-01', repository_id: '' }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.range_from).toBe('2026-07-01T00:00:00Z');
    expect(body.range_to).toBe('2026-08-01T00:00:00Z');
    expect(response.status).toBe(303);
    expect(location(response)).toBe('/compliance/evidence-packs?pack_id=pack-9');
  });

  it('refuses an inverted range without reaching the BFF', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(context({ range_from: '2026-08-01', range_to: '2026-07-01', repository_id: '' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location(response)).toContain('evidence_outcome=requestRefused');
  });

  it('reports a backend refusal without naming a cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const response = await POST(context({ range_from: '2026-07-01', range_to: '2026-08-01', repository_id: '' }));
    expect(location(response)).toContain('evidence_outcome=requestRefused');
    expect(location(response).toLowerCase()).not.toContain('permission');
  });

  it('carries a repository scope when one was given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pack_id: 'p', state: 'PENDING' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await POST(context({ range_from: '2026-07-01', range_to: '2026-08-01', repository_id: 'acme/web' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).repository_id).toBe('acme/web');
  });
});
