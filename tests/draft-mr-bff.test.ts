// ADR-0087 / SPEC-0064 — the draft surface's wire behaviour.
//
// Same discipline as mr-actions-bff.test.ts: assert the WIRE. The two traps
// are (1) a draft flag that never reaches the BFF's ParseForm, and (2) a
// mark-ready call that carries no expected version, which the backend would
// refuse as a malformed request indistinguishable from every other refusal.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openMergeRequest, markMergeRequestReady } from '../src/lib/bff';

const view = {
  merge_request_id: 'mr1',
  repository_id: 'repo1',
  source_ref: 'feature',
  target_ref: 'main',
  title: 'Add the thing',
  description: '',
  creator_id: 'dev@gitsaas.test',
  state: 'MERGE_REQUEST_STATE_DRAFT',
  head_revision: 'abcdef1234567890',
  version: 3,
  created_at: '2026-08-21T00:00:00Z',
};

const request = () =>
  new Request('http://app.gitsaas.test/repos/repo1/merge_requests/mr1', {
    headers: { cookie: '__Host-gitfrok_session=abc' },
  });

function ok() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(view), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

function form(init: RequestInit): URLSearchParams {
  const headers = init.headers as Headers;
  expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  return new URLSearchParams(init.body as string);
}

describe('SPEC-0064 AC1 — opening as a draft', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends draft=on when asked, and nothing about it otherwise', async () => {
    const withDraft = ok();
    vi.stubGlobal('fetch', withDraft);
    await openMergeRequest(request(), 'repo1', {
      source_ref: 'feature', target_ref: 'main', title: 't', description: '', draft: true,
    });
    let [, init] = withDraft.mock.calls[0];
    expect(form(init).get('draft')).toBe('on');

    const withoutDraft = ok();
    vi.stubGlobal('fetch', withoutDraft);
    await openMergeRequest(request(), 'repo1', {
      source_ref: 'feature', target_ref: 'main', title: 't', description: '',
    });
    [, init] = withoutDraft.mock.calls[0];
    expect(form(init).get('draft')).toBeNull();
  });
});

describe('SPEC-0064 AC3 — marking a draft ready', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the expected version to the ready route, form-encoded', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await markMergeRequestReady(request(), 'repo1', 'mr1', 3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/repositories/repo1/merge_requests/mr1/ready');
    expect(init.method).toBe('POST');
    expect(form(init).get('expected_version')).toBe('3');
  });

  it('refuses to compile a request without a usable version', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    await expect(markMergeRequestReady(request(), 'repo1', 'mr1', Number.NaN)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
