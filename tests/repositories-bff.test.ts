// T-0055 / SPEC-0052 AC10, AC12 — the repository list client.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { listRepositories } from '../src/lib/bff';

const request = () =>
  new Request('http://app.gitsaas.test/', { headers: { cookie: '__Host-gitfrok_session=abc' } });

afterEach(() => vi.restoreAllMocks());

describe('SPEC-0052 AC10 — reading the list', () => {
  it('asks the BFF with the session cookie and passes the page through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        repositories: [{ repository_id: 'acme/web', name: 'Web' }],
        next_page_token: 'opaque',
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await listRepositories(request(), '');

    expect(page.repositories[0].repository_id).toBe('acme/web');
    expect(page.next_page_token).toBe('opaque');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/repositories');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
    // No scope travels: the listable set is the server's, and the request has
    // nothing with which to widen it.
    for (const forbidden of ['tenant_id', 'actor_id', 'repository_id', 'scope', 'owner']) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it('forwards a page token verbatim and computes no offset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ repositories: [], next_page_token: '' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await listRepositories(request(), 'opaque::42');
    const [url] = fetchMock.mock.calls[0];
    expect(url.searchParams.get('page_token')).toBe('opaque::42');
    for (const forbidden of ['offset', 'page', 'skip']) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it('reads an absent array as an empty page, never as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    const page = await listRepositories(request(), '');
    expect(page.repositories).toEqual([]);
    expect(page.next_page_token).toBe('');
  });

  it('carries no total, because the contract has no field for one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ repositories: [], next_page_token: '', total: 99 }), { status: 200 }),
    ));
    const page = await listRepositories(request(), '');
    expect('total' in (page as unknown as Record<string, unknown>)).toBe(false);
  });

  it('reports a refusal as one coarse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('repositories unavailable', { status: 404 })));
    await expect(listRepositories(request(), '')).rejects.toThrow(/unavailable/i);
  });
});
