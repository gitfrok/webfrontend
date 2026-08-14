import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { POST } from '../src/pages/api/security/triage';

// The browser-facing triage route is a relay: it forwards the decision and
// the session cookie to the BFF and passes the answer back. Every failure —
// malformed body, unnamed state, or a backend refusal — is the same coarse
// 404 that distinguishes nothing (SPEC-0001).
function context(body: string, cookie = '__Host-gitfrok_session=abc'): APIContext {
  const request = new Request('http://app.gitsaas.test/api/security/triage', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body,
  });
  return { request } as unknown as APIContext;
}

describe('POST /api/security/triage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards a decision to the BFF and returns the record now in force', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ triage_id: 't1', finding_id: 'f1', repository_id: 'r1', state: 'FIX', justification: 'will patch', version: 1, actor_id: 'a1', occurred_at: '2026-08-14T00:00:00Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(context(JSON.stringify({ finding_id: 'f1', state: 'FIX', justification: 'will patch', expected_version: 0 })));
    expect(response.status).toBe(200);
    const record = await response.json();
    expect(record.triage_id).toBe('t1');
    expect(record.state).toBe('FIX');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toMatch(/\/api\/v1\/security\/triage$/);
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
    expect(JSON.parse(init.body)).toEqual({ finding_id: 'f1', state: 'FIX', justification: 'will patch', expected_version: 0 });
  });

  it('refuses a malformed body with the same coarse 404, without touching the BFF', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await POST(context('not json'))).status).toBe(404);
    expect((await POST(context(JSON.stringify({ finding_id: 'f1', state: 'IGNORE' })))).status).toBe(404);
    expect((await POST(context(JSON.stringify({ finding_id: '', state: 'FIX' })))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a backend refusal through as the one coarse 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('security unavailable', { status: 404 })));
    const response = await POST(context(JSON.stringify({ finding_id: 'f1', state: 'DEFER', justification: '', expected_version: 0 })));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
