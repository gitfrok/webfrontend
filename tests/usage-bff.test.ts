import { describe, it, expect, vi, afterEach } from 'vitest';
import { usageView } from '../src/lib/bff';

// The usage view surface must behave like every other BFF read: fetch from
// the BFF origin with the session cookie forwarded, pass the view through
// untouched, and treat any refusal as one coarse failure — never as an
// empty or zeroed view (SPEC-0041, SPEC-0001, invariant 22).
describe('usage bff client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the usage view from the BFF origin with the session cookie', async () => {
    const body = {
      dimensions: [
        { dimension: 'CI_MINUTES', coverage: 'METERED', state: 'WITHIN', value: 42, envelope: 10000, notification: 8000, unit: 'minutes', gaps: [] },
        { dimension: 'SEATS', coverage: 'DEFERRED', deferred_reason: 'no authoritative telemetry source yet', gaps: [] },
      ],
      divergences: [],
      generated_at: '2026-08-15T12:00:00Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/usage', { headers: { cookie: '__Host-gitfrok_session=abc' } });
    const view = await usageView(request);

    expect(view.dimensions).toHaveLength(2);
    expect(view.dimensions[0].value).toBe(42);
    // A deferred row carries no number at all — the field is absent, not zero.
    expect(view.dimensions[1].value).toBeUndefined();
    expect(view.dimensions[1].deferred_reason).toBe('no authoritative telemetry source yet');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toMatch(/\/api\/v1\/usage\/view$/);
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('never lets a failed read through as an empty or zeroed view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('usage unavailable', { status: 404 })));
    await expect(usageView(new Request('http://app.gitsaas.test/usage'))).rejects.toThrow();
  });
});
