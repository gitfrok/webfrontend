import { describe, it, expect, vi, afterEach } from 'vitest';
import { securityDashboard, securityFindingsSummary, setSecurityTriage } from '../src/lib/bff';

// The security dashboard surface must behave like every other BFF read:
// fetch from the BFF origin with the session cookie forwarded, pass results
// through untouched, and treat any refusal as one coarse failure — never as
// a permission statement (SPEC-0026 AC6, invariant 22).
describe('security bff client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the dashboard from the BFF origin with filters, paging and the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ findings: [{ finding_id: 'f1', repository_id: 'r1' }], next_page_token: 'next' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/security', { headers: { cookie: '__Host-gitfrok_session=abc' } });
    const result = await securityDashboard(request, { severity: 'HIGH', min_age_days: 7 }, 25, 'tok');

    expect(result.findings[0].finding_id).toBe('f1');
    expect(result.next_page_token).toBe('next');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toContain('/api/v1/security/dashboard?');
    expect(url.searchParams.get('severity')).toBe('HIGH');
    expect(url.searchParams.get('min_age_days')).toBe('7');
    expect(url.searchParams.get('page_size')).toBe('25');
    expect(url.searchParams.get('page_token')).toBe('tok');
    // Absent filters carry their no-filter meaning and must not travel.
    expect(url.searchParams.has('repository')).toBe(false);
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('asks for the summary with one repeated facet parameter per dimension', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total_count: 3, facets: [{ dimension: 'severity', values: [{ value: 'HIGH', count: 3 }] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await securityFindingsSummary(
      new Request('http://app.gitsaas.test/security'),
      { owning_team: 'platform' },
      ['severity', 'scanner_class'],
    );

    expect(result.total_count).toBe(3);
    const [url] = fetchMock.mock.calls[0];
    expect(url.href).toContain('/api/v1/security/findings/summary?');
    expect(url.searchParams.getAll('facet')).toEqual(['severity', 'scanner_class']);
    expect(url.searchParams.get('owning_team')).toBe('platform');
  });

  it('never lets a failed dashboard read through as an empty page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('security unavailable', { status: 404 })));
    await expect(securityDashboard(new Request('http://app.gitsaas.test/security'), {}, 25)).rejects.toThrow();
  });

  it('posts a triage decision as JSON under the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ triage_id: 't1', finding_id: 'f1', repository_id: 'r1', state: 'ACCEPT', justification: 'ok', version: 1, actor_id: 'a1', occurred_at: '2026-08-14T00:00:00Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/api/security/triage', { headers: { cookie: '__Host-gitfrok_session=abc' } });
    const record = await setSecurityTriage(request, { finding_id: 'f1', state: 'ACCEPT', justification: 'ok', expected_version: 0 });

    expect(record.version).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toMatch(/\/api\/v1\/security\/triage$/);
    expect(init.method).toBe('POST');
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
    expect(JSON.parse(init.body)).toEqual({ finding_id: 'f1', state: 'ACCEPT', justification: 'ok', expected_version: 0 });
  });

  it('refuses a state the contract does not name before anything crosses the wire', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      setSecurityTriage(new Request('http://app.gitsaas.test/'), { finding_id: 'f1', state: 'IGNORE', justification: '', expected_version: 0 }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
