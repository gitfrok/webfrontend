// T-0052 / SPEC-0051 AC1, AC2, AC5, AC6 — the auditor grant clients.
//
// The trap here is quieter than the merge-request one and does more damage:
// the backend answers an issued grant with "the expiry it recognized — which
// may bound the requested one". A client that confirmed the grant from its own
// request would tell an admin their auditor has access until a date the server
// never agreed to.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { issueAuditorGrant, listAuditorGrants, revokeAuditorGrant } from '../src/lib/bff';

const request = () =>
  new Request('http://app.gitsaas.test/compliance/auditor-grants', {
    headers: { cookie: '__Host-gitfrok_session=abc' },
  });

const grant = (overrides = {}) => ({
  grant_id: 'grant-1',
  tenant_id: 'tenant-1',
  auditor_principal_id: 'auditor@example.test',
  range_from: '2026-07-01T00:00:00Z',
  range_to: '2026-08-01T00:00:00Z',
  pack_ids: ['pack-1'],
  expires_at: '2026-09-01T00:00:00Z',
  granted_by: 'admin@gitsaas.test',
  issued_at: '2026-08-18T00:00:00Z',
  state: 'ACTIVE',
  ...overrides,
});

const issued = (overrides = {}) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(grant(overrides)), { status: 200, headers: { 'content-type': 'application/json' } }),
  );

const valid = {
  auditor_principal_id: 'auditor@example.test',
  range_from: '2026-07-01T00:00:00Z',
  range_to: '2026-08-01T00:00:00Z',
  repository_id: '',
  pack_ids: ['pack-1'],
  expires_at: '2026-12-01T00:00:00Z',
};

afterEach(() => vi.restoreAllMocks());

describe('SPEC-0051 AC1 — issuing a grant', () => {
  it('posts the scope as RFC3339 JSON with the session cookie', async () => {
    const fetchMock = issued();
    vi.stubGlobal('fetch', fetchMock);

    await issueAuditorGrant(request(), valid);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/audit/auditor-grants');
    expect(init.method).toBe('POST');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
    const body = JSON.parse(init.body as string);
    expect(body.auditor_principal_id).toBe('auditor@example.test');
    expect(body.pack_ids).toEqual(['pack-1']);
    expect(body.expires_at).toBe('2026-12-01T00:00:00Z');
    // A tenant, actor, role, grant identity, state or version has no field to
    // travel in — the contract names none of them (SPEC-0033 AC8).
    for (const forbidden of ['tenant_id', 'actor_id', 'grant_id', 'state', 'version', 'granted_by']) {
      expect(forbidden in body).toBe(false);
    }
  });

  it('omits an absent repository scope rather than sending an empty one', async () => {
    const fetchMock = issued();
    vi.stubGlobal('fetch', fetchMock);
    await issueAuditorGrant(request(), valid);
    expect('repository_id' in JSON.parse(fetchMock.mock.calls[0][1].body as string)).toBe(false);
  });

  it.each([
    ['no auditor', { auditor_principal_id: '' }],
    ['no packs', { pack_ids: [] }],
    ['an unparseable expiry', { expires_at: 'whenever' }],
    ['an inverted range', { range_from: '2026-08-01T00:00:00Z', range_to: '2026-07-01T00:00:00Z' }],
    ['an open range', { range_to: '' }],
  ])('refuses %s before compiling a request', async (_name, overrides) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(issueAuditorGrant(request(), { ...valid, ...overrides })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the grant the SERVER issued, not the one that was asked for', async () => {
    // The requested expiry is December; the server bounds it to September.
    const fetchMock = issued({ expires_at: '2026-09-01T00:00:00Z' });
    vi.stubGlobal('fetch', fetchMock);
    const result = await issueAuditorGrant(request(), valid);
    expect(result.expires_at).toBe('2026-09-01T00:00:00Z');
    expect(result.expires_at).not.toBe(valid.expires_at);
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(issueAuditorGrant(request(), valid)).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0051 AC3 — listing grants', () => {
  it('reads the tenant grants and passes them through untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ grants: [grant(), grant({ grant_id: 'grant-2', state: 'REVOKED' })] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await listAuditorGrants(request(), '');
    expect(result.grants.length).toBe(2);
    expect(result.grants[1].state).toBe('REVOKED');
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/audit/auditor-grants');
    expect(fetchMock.mock.calls[0][0].searchParams.has('auditor_principal_id')).toBe(false);
  });

  it('narrows to one auditor principal when asked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ grants: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await listAuditorGrants(request(), 'auditor@example.test');
    expect(fetchMock.mock.calls[0][0].searchParams.get('auditor_principal_id')).toBe('auditor@example.test');
  });

  it('reads an absent grants array as an empty list, never as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    const result = await listAuditorGrants(request(), '');
    expect(result.grants).toEqual([]);
  });
});

describe('SPEC-0051 AC5 — revoking a grant', () => {
  it('issues a DELETE and returns the grant as it now stands', async () => {
    const fetchMock = issued({ state: 'REVOKED', revoked_at: '2026-08-18T12:00:00Z' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await revokeAuditorGrant(request(), 'grant-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(url.pathname).toBe('/api/v1/audit/auditor-grants/grant-1');
    expect(result.state).toBe('REVOKED');
  });

  it('encodes the grant identifier rather than pasting it into the path', async () => {
    const fetchMock = issued();
    vi.stubGlobal('fetch', fetchMock);
    await revokeAuditorGrant(request(), 'grant/one');
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/audit/auditor-grants/grant%2Fone');
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(revokeAuditorGrant(request(), 'grant-1')).rejects.toThrow(/unavailable/i);
  });
});
