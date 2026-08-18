// T-0050 / SPEC-0049 AC1 — the SSR query relay.
import { describe, it, expect } from 'vitest';
import type { APIContext } from 'astro';
import { POST } from '../src/pages/api/search/index';

function context(fields: Record<string, string>): APIContext {
  const request = new Request('http://app.gitsaas.test/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: '__Host-gitfrok_session=abc' },
    body: new URLSearchParams(fields).toString(),
  });
  const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
  return { request, redirect } as unknown as APIContext;
}
const location = (r: Response) => r.headers.get('location') ?? '';

describe('POST /api/search', () => {
  it('puts the query in the URL so a result page is linkable and reloadable', async () => {
    const response = await POST(context({ q: 'BuildQuery', mode: 'SUBSTRING' }));
    expect(response.status).toBe(303);
    expect(location(response)).toBe('/search?q=BuildQuery&mode=SUBSTRING');
  });

  it('encodes a query that would otherwise break the URL', async () => {
    const response = await POST(context({ q: '^func\\s+&|x', mode: 'REGEX' }));
    expect(location(response)).toContain(encodeURIComponent('^func\\s+&|x'));
  });

  it('refuses a mode the contract does not name, and says which kind of refusal it was', async () => {
    // The BFF would answer this with the same coarse 404 as a dead session,
    // which tells the person who typed it nothing.
    const response = await POST(context({ q: 'x', mode: 'FUZZY' }));
    expect(location(response)).toContain('search_outcome=modeRefused');
  });

  it('sends an empty query back to the bare page rather than running it', async () => {
    expect(location(await POST(context({ q: '   ', mode: 'SUBSTRING' })))).toBe('/search');
  });

  it('trims the query so a stray space is not part of the search', async () => {
    expect(location(await POST(context({ q: '  BuildQuery  ', mode: 'SUBSTRING' })))).toContain('q=BuildQuery&');
  });
});
