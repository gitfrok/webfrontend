import { describe, it, expect, vi, afterEach } from 'vitest';
import { tree, file } from '../src/lib/bff';

// The BFF client must always fetch from the BFF origin with the session cookie
// forwarded and never invent its own upstream (SPEC-0021, invariant 22).
describe('bff client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the tree view from the BFF origin and forwards the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ entries: [{ path: 'README.md', kind: 1, sizeBytes: 7 }], nextPageToken: 'next' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/repos/r1/tree/main', { headers: { cookie: '__Host-gitfrok_session=abc' } });
    const result = await tree(request, 'r1', 'main');

    expect(result.entries[0].path).toBe('README.md');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toMatch(/\/v1\/repositories\/r1\/tree\?revision=main$/);
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('streams the file view and parses the metadata header once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([104, 105]), {
        status: 200,
        headers: { 'x-gitfrok-file-metadata': JSON.stringify({ path: 'README.md', revision: 'main', sizeBytes: 7 }) },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/repos/r1/file/main/README.md');
    const result = await file(request, 'r1', 'main', 'README.md');

    expect(result.metadata?.path).toBe('README.md');
    expect(new TextDecoder().decode(result.body)).toBe('hi');
  });

  it('never lets a failed view read through as an empty file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 404 })));
    await expect(file(new Request('http://app.gitsaas.test/'), 'r1', 'main', 'x')).rejects.toThrow();
  });
});
