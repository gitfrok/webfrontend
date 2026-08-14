import { describe, it, expect, vi, afterEach } from 'vitest';
import { mergeRequestFindings } from '../src/lib/bff';

// The merge-request findings surface (SPEC-0028) must behave like every other
// BFF read: fetch from the BFF origin with the session cookie forwarded, pass
// the authorized page through untouched, and treat any refusal as one coarse
// failure. The merge request travels as its opaque identity only — the route
// has no repository segment, because the contract's request has no repository
// field to carry one (recorded BFF deviation, T-0024).
describe('merge request findings bff client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const page = {
    findings: [
      {
        finding: { finding_id: 'finding-b', repository_id: 'r1', severity: 'HIGH', scanner_class: 'SAST' },
        head_location: { artifact_path: 'app/main.go', enclosing_content: 'func handle', component: '', component_version: '' },
        attribution: 'ATTRIBUTED',
      },
    ],
    next_page_token: 'next',
    summary: {
      status: 'ATTRIBUTED',
      head_revision: 'head-rev',
      merge_base_revision: 'base-rev',
      stale: false,
      attributed_low: 0,
      attributed_medium: 0,
      attributed_high: 1,
      attributed_critical: 0,
    },
  };

  it('requests the findings by opaque merge-request identity with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/repos/r1/merge_requests/mr-1', {
      headers: { cookie: '__Host-gitfrok_session=abc' },
    });
    const result = await mergeRequestFindings(request, 'mr-1', {}, 0);

    expect(result.findings[0].finding.finding_id).toBe('finding-b');
    expect(result.findings[0].attribution).toBe('ATTRIBUTED');
    expect(result.summary.status).toBe('ATTRIBUTED');
    expect(result.summary.attributed_high).toBe(1);
    expect(result.next_page_token).toBe('next');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/security/merge-requests/mr-1/findings');
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('sends only the filters the caller set; UNSPECIFIED/empty/zero must not travel', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await mergeRequestFindings(new Request('http://app.gitsaas.test/'), 'mr-1', {}, 0);
    let [url] = fetchMock.mock.calls[0];
    expect(url.searchParams.has('scanner_class')).toBe(false);
    expect(url.searchParams.has('severity')).toBe(false);
    expect(url.searchParams.has('attribution')).toBe(false);
    expect(url.searchParams.has('page_size')).toBe(false);
    expect(url.searchParams.has('page_token')).toBe(false);

    await mergeRequestFindings(
      new Request('http://app.gitsaas.test/'),
      'mr-1',
      { scanner_class: 'SAST', severity: 'HIGH', attribution: 'ATTRIBUTED' },
      25,
      'tok',
    );
    [url] = fetchMock.mock.calls[1];
    expect(url.searchParams.get('scanner_class')).toBe('SAST');
    expect(url.searchParams.get('severity')).toBe('HIGH');
    expect(url.searchParams.get('attribution')).toBe('ATTRIBUTED');
    expect(url.searchParams.get('page_size')).toBe('25');
    expect(url.searchParams.get('page_token')).toBe('tok');
  });

  it('refuses a filter the contract does not name before anything crosses the wire', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const filters of [
      { scanner_class: 'XRAY' },
      { severity: 'APOCALYPTIC' },
      { attribution: 'SOMETIMES' },
    ]) {
      await expect(
        mergeRequestFindings(new Request('http://app.gitsaas.test/'), 'mr-1', filters, 0),
      ).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty merge-request identity before anything crosses the wire', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(mergeRequestFindings(new Request('http://app.gitsaas.test/'), '', {}, 0)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never lets a failed read through as an empty page', async () => {
    // Missing, malformed and unauthorized are one coarse refusal on the BFF
    // (SPEC-0001); this layer must surface every one of them as a failure,
    // never as a page with zero findings (SPEC-0028 AC7).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('denied', { status: 404 })));
    await expect(mergeRequestFindings(new Request('http://app.gitsaas.test/'), 'mr-1', {}, 0)).rejects.toThrow();
  });
});
