// T-0049 / SPEC-0048 AC1–AC3 — the three merge-request writes.
//
// These assert the WIRE, not the call shape, because both traps this task
// exists to avoid are invisible at the call site and produce the same coarse
// 404 the backend returns for a dead session:
//
//   1. The BFF parses these writes with r.ParseForm()/PostFormValue. A JSON
//      body arrives as no fields at all.
//   2. The disposition is resolved through a Go map lookup on the protobuf
//      enum's value table, which yields 0 (UNSPECIFIED) for any key it does
//      not hold. "APPROVE" is therefore a silent downgrade, not an error.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  openMergeRequest,
  submitMergeRequestReview,
  mergeMergeRequest,
  MR_DISPOSITION_WIRE,
} from '../src/lib/bff';

const view = {
  merge_request_id: 'mr1',
  repository_id: 'repo1',
  source_ref: 'feature',
  target_ref: 'main',
  title: 'Add the thing',
  description: 'it does the thing',
  creator_id: 'dev@gitsaas.test',
  state: 'OPEN',
  head_revision: 'abcdef1234567890',
  version: 3,
  created_at: '2026-08-18T00:00:00Z',
};

function ok() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(view), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

const request = () =>
  new Request('http://app.gitsaas.test/repos/repo1/merge_requests/mr1', {
    headers: { cookie: '__Host-gitfrok_session=abc' },
  });

/** The body as the BFF's ParseForm would see it. */
function form(init: RequestInit): URLSearchParams {
  const headers = init.headers as Headers;
  expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  return new URLSearchParams(init.body as string);
}

describe('SPEC-0048 AC1 — opening a merge request', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the four fields form-encoded, with the session cookie', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    const result = await openMergeRequest(request(), 'repo1', {
      source_ref: 'feature',
      target_ref: 'main',
      title: 'Add the thing',
      description: 'it does the thing',
    });

    expect(result.merge_request_id).toBe('mr1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/repositories/repo1/merge_requests');
    expect(init.method).toBe('POST');
    const body = form(init);
    expect(body.get('source_ref')).toBe('feature');
    expect(body.get('target_ref')).toBe('main');
    expect(body.get('title')).toBe('Add the thing');
    expect(body.get('description')).toBe('it does the thing');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('never sends JSON — a JSON body reaches ParseForm as no fields', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await openMergeRequest(request(), 'repo1', {
      source_ref: 'feature', target_ref: 'main', title: 't', description: '',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('content-type')).not.toContain('json');
    expect(() => JSON.parse(init.body as string)).toThrow();
  });

  it('refuses to compile a request when a required ref is missing', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      openMergeRequest(request(), 'repo1', { source_ref: '', target_ref: 'main', title: 't', description: '' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refusal as one coarse failure that names no cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('merge request unavailable', { status: 404 })));
    await expect(
      openMergeRequest(request(), 'repo1', { source_ref: 'f', target_ref: 'main', title: 't', description: '' }),
    ).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0048 AC2 — submitting a review', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the protobuf enum name, never the bare word', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    await submitMergeRequestReview(request(), 'repo1', 'mr1', {
      disposition: 'APPROVE',
      comment: 'looks right',
      head_revision: view.head_revision,
      expected_version: view.version,
    });

    const body = form(fetchMock.mock.calls[0][1]);
    // The BFF does ReviewDisposition_value[disposition]; "APPROVE" is not a
    // key in that table, so it would travel as 0 = UNSPECIFIED and be refused.
    expect(body.get('disposition')).toBe('REVIEW_DISPOSITION_APPROVE');
    expect(body.get('disposition')).not.toBe('APPROVE');
    expect(body.get('comment')).toBe('looks right');
    expect(body.get('head_revision')).toBe(view.head_revision);
    expect(body.get('expected_version')).toBe('3');
  });

  it('pins all three wire values to the contract enum', () => {
    expect(MR_DISPOSITION_WIRE).toEqual({
      APPROVE: 'REVIEW_DISPOSITION_APPROVE',
      REQUEST_CHANGES: 'REVIEW_DISPOSITION_REQUEST_CHANGES',
      COMMENT: 'REVIEW_DISPOSITION_COMMENT',
    });
  });

  it('refuses a disposition outside the vocabulary rather than sending UNSPECIFIED', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      submitMergeRequestReview(request(), 'repo1', 'mr1', {
        disposition: 'LGTM' as never, comment: '', head_revision: view.head_revision, expected_version: 3,
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty head revision — the backend does, and a coarse 404 hides why', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      submitMergeRequestReview(request(), 'repo1', 'mr1', {
        disposition: 'APPROVE', comment: '', head_revision: '', expected_version: 3,
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a version that was not read from a rendered view', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    for (const bad of [-1, 1.5, Number.NaN]) {
      await expect(
        submitMergeRequestReview(request(), 'repo1', 'mr1', {
          disposition: 'COMMENT', comment: 'x', head_revision: view.head_revision, expected_version: bad,
        }),
      ).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an empty comment as an empty field, not as an absent one', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await submitMergeRequestReview(request(), 'repo1', 'mr1', {
      disposition: 'APPROVE', comment: '', head_revision: view.head_revision, expected_version: 3,
    });
    const body = form(fetchMock.mock.calls[0][1]);
    expect(body.has('comment')).toBe(true);
    expect(body.get('comment')).toBe('');
  });
});

describe('SPEC-0048 AC3 — merging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts only the expected version, form-encoded', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    await mergeMergeRequest(request(), 'repo1', 'mr1', 3);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/repositories/repo1/merge_requests/mr1/merge');
    const body = form(init);
    expect(body.get('expected_version')).toBe('3');
    // The merge carries no opinion about whether it should be allowed.
    expect(body.has('disposition')).toBe(false);
    expect(body.has('force')).toBe(false);
  });

  it('encodes identifiers rather than pasting them into the path', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await mergeMergeRequest(request(), 'repo/one', 'mr 1', 0);
    const [url] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/repositories/repo%2Fone/merge_requests/mr%201/merge');
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('merge request unavailable', { status: 404 })));
    await expect(mergeMergeRequest(request(), 'repo1', 'mr1', 3)).rejects.toThrow(/unavailable/i);
  });
});
