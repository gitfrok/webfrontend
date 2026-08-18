// T-0049 / SPEC-0048 AC4, AC5 — the three SSR write routes.
//
// Each is a relay with one piece of judgement in it: when the write is
// refused, it re-reads the merge request so staleness can be told apart from
// a plain refusal. That re-read is the only thing standing between an honest
// "this changed under you" and a message that invents a reason.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { POST as openRoute } from '../src/pages/api/repos/[repositoryID]/merge_requests/index';
import { POST as reviewRoute } from '../src/pages/api/repos/[repositoryID]/merge_requests/[mergeRequestID]/review';
import { POST as mergeRoute } from '../src/pages/api/repos/[repositoryID]/merge_requests/[mergeRequestID]/merge';

const view = (version: number, id = 'mr-1') => ({
  merge_request_id: id, repository_id: 'repo-1',
  source_ref: 'feature', target_ref: 'main',
  title: 'Add the thing', description: '',
  creator_id: 'dev@gitsaas.test', state: 'OPEN',
  head_revision: 'abcdef1234567890', version,
  created_at: '2026-08-18T00:00:00Z',
});

function context(fields: Record<string, string>, params: Record<string, string>): APIContext {
  const request = new Request('http://app.gitsaas.test/api/repos/repo-1/merge_requests/mr-1/review', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: '__Host-gitfrok_session=abc' },
    body: new URLSearchParams(fields).toString(),
  });
  const redirect = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });
  return { request, params, redirect } as unknown as APIContext;
}

const jsonOk = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
const refused = () => new Response('merge request unavailable', { status: 404 });

function location(response: Response): string {
  return response.headers.get('location') ?? '';
}

afterEach(() => vi.restoreAllMocks());

describe('POST …/merge_requests — open', () => {
  it('redirects to the new merge request on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonOk(view(1, 'mr-new'))));
    const response = await openRoute(context(
      { source_ref: 'feature', target_ref: 'main', title: 'Add the thing', description: '' },
      { repositoryID: 'repo-1' },
    ));
    expect(response.status).toBe(303);
    expect(location(response)).toBe('/repos/repo-1/merge_requests/mr-new?mr_outcome=applied');
  });

  it('reports a refusal without claiming staleness — an open has no prior version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refused()));
    const response = await openRoute(context(
      { source_ref: 'feature', target_ref: 'main', title: 't', description: '' },
      { repositoryID: 'repo-1' },
    ));
    expect(location(response)).toContain('mr_outcome=notApplied');
    expect(location(response)).not.toContain('stale');
  });
});

describe('POST …/review', () => {
  it('forwards the enum name and redirects as applied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(view(4)));
    vi.stubGlobal('fetch', fetchMock);

    const response = await reviewRoute(context(
      { disposition: 'APPROVE', comment: 'ok', head_revision: 'abcdef1234567890', expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get('disposition')).toBe('REVIEW_DISPOSITION_APPROVE');
    expect(location(response)).toBe('/repos/repo-1/merge_requests/mr-1?mr_outcome=applied');
  });

  it('reports staleness when the re-read shows a newer version', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(refused())      // the write
      .mockResolvedValueOnce(jsonOk(view(9))); // the re-read
    vi.stubGlobal('fetch', fetchMock);

    const response = await reviewRoute(context(
      { disposition: 'APPROVE', comment: '', head_revision: 'abcdef1234567890', expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    expect(location(response)).toContain('mr_outcome=stale');
  });

  it('reports not-applied when the re-read shows the same version', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(jsonOk(view(3))));
    const response = await reviewRoute(context(
      { disposition: 'APPROVE', comment: '', head_revision: 'abcdef1234567890', expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    expect(location(response)).toContain('mr_outcome=notApplied');
  });

  it('does not invent staleness when the re-read itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refused()));
    const response = await reviewRoute(context(
      { disposition: 'APPROVE', comment: '', head_revision: 'abcdef1234567890', expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    expect(location(response)).toContain('mr_outcome=rereadFailed');
    expect(location(response)).not.toContain('stale');
  });

  it('refuses a disposition outside the vocabulary without calling the BFF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(view(4)));
    vi.stubGlobal('fetch', fetchMock);
    const response = await reviewRoute(context(
      { disposition: 'LGTM', comment: '', head_revision: 'abcdef1234567890', expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    // The write is never attempted; only the re-read runs.
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes.length).toBe(0);
    expect(location(response)).toContain('mr_outcome=');
  });
});

describe('POST …/merge', () => {
  it('redirects as applied and sends only the expected version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk({ ...view(4), state: 'MERGED' }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await mergeRoute(context(
      { expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect([...body.keys()]).toEqual(['expected_version']);
    expect(location(response)).toBe('/repos/repo-1/merge_requests/mr-1?mr_outcome=applied');
  });

  it('reports a gate refusal as not-applied, never as a policy statement', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(jsonOk(view(3))));
    const response = await mergeRoute(context(
      { expected_version: '3' },
      { repositoryID: 'repo-1', mergeRequestID: 'mr-1' },
    ));
    expect(location(response)).toContain('mr_outcome=notApplied');
    expect(location(response).toLowerCase()).not.toContain('policy');
    expect(location(response).toLowerCase()).not.toContain('permission');
  });
});
