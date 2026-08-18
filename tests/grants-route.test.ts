// T-0052 / SPEC-0051 AC1, AC2, AC5 — the SSR relays.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { POST as issueRoute } from '../src/pages/api/compliance/auditor-grants/index';
import { POST as revokeRoute } from '../src/pages/api/compliance/auditor-grants/[grantID]/revoke';

function context(fields: Record<string, string>, params: Record<string, string> = {}): APIContext {
  const request = new Request('http://app.gitsaas.test/api/compliance/auditor-grants', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: '__Host-gitfrok_session=abc' },
    body: new URLSearchParams(fields).toString(),
  });
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
  return { request, params, redirect } as unknown as APIContext;
}

const location = (r: Response) => r.headers.get('location') ?? '';
const okGrant = () =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({
    grant_id: 'g1', tenant_id: 't', auditor_principal_id: 'a', range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z', pack_ids: ['p'], expires_at: '2026-09-01T00:00:00Z',
    granted_by: 'admin', issued_at: '2026-08-18T00:00:00Z', state: 'ACTIVE',
  }), { status: 200 }));

const good = {
  auditor_principal_id: 'auditor@example.test',
  range_from: '2026-07-01', range_to: '2026-08-01',
  repository_id: '', pack_ids: 'pack-1\npack-2\n', expires_at: '2026-12-01',
};

afterEach(() => vi.restoreAllMocks());

describe('POST /api/compliance/auditor-grants', () => {
  it('splits pack IDs by line, drops blanks, and sends RFC3339 instants', async () => {
    const fetchMock = okGrant();
    vi.stubGlobal('fetch', fetchMock);

    const response = await issueRoute(context({ ...good, pack_ids: 'pack-1\n\n  pack-2  \n' }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.pack_ids).toEqual(['pack-1', 'pack-2']);
    expect(body.expires_at).toBe('2026-12-01T00:00:00Z');
    expect(location(response)).toBe('/compliance/auditor-grants?grant_outcome=issued');
  });

  it('does not carry the issued grant through the URL — the list re-reads it', async () => {
    // Passing the grant through the redirect would make the page render a
    // grant that was true at issue time. The server's record is the fact, and
    // it may have bounded the expiry (SPEC-0051 AC2).
    vi.stubGlobal('fetch', okGrant());
    const response = await issueRoute(context(good));
    expect(location(response)).not.toContain('expires');
    expect(location(response)).not.toContain('grant_id');
  });

  it('refuses an empty pack list without reaching the BFF', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await issueRoute(context({ ...good, pack_ids: '   \n  ' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location(response)).toContain('grant_outcome=notApplied');
  });

  it('reports a backend refusal without naming a cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const response = await issueRoute(context(good));
    expect(location(response)).toContain('grant_outcome=notApplied');
    expect(location(response).toLowerCase()).not.toContain('permission');
  });
});

describe('POST /api/compliance/auditor-grants/{grantID}/revoke', () => {
  it('issues an upstream DELETE and redirects', async () => {
    const fetchMock = okGrant();
    vi.stubGlobal('fetch', fetchMock);

    const response = await revokeRoute(context({}, { grantID: 'grant-7' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/api/v1/audit/auditor-grants/grant-7');
    expect(location(response)).toBe('/compliance/auditor-grants?grant_outcome=revoked');
  });

  it('reports a refusal as not-applied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const response = await revokeRoute(context({}, { grantID: 'grant-7' }));
    expect(location(response)).toContain('grant_outcome=notApplied');
  });

  it('refuses a missing grant identifier without reaching the BFF', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await revokeRoute(context({}, {}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location(response)).toContain('grant_outcome=notApplied');
  });
});
