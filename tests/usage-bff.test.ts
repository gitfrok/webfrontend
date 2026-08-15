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

  // SPEC-0046 AC2/AC3: the trend and the throttle observation pass through
  // untouched — the browser renders them, never derives them; an absent
  // observation stays absent.
  it('passes the trend and the throttle observation through untouched', async () => {
    const body = {
      dimensions: [
        { dimension: 'CI_MINUTES', coverage: 'METERED', state: 'NEAR', trend: 'RISING', value: 8500, envelope: 10000, gaps: [] },
      ],
      divergences: [],
      throttle: {
        desired_generation: 7, desired_max_ci_concurrency: 2, desired_queue_depth_cap: 50,
        has_applied_ack: true, applied_generation: 7, applied: false,
        applied_error: 'scaler unavailable', acked_at: '2026-08-15T12:30:00Z',
      },
      generated_at: '2026-08-15T12:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    ));
    const view = await usageView(new Request('http://app.gitsaas.test/usage'));
    expect(view.dimensions[0].trend).toBe('RISING');
    expect(view.throttle?.desired_max_ci_concurrency).toBe(2);
    expect(view.throttle?.applied).toBe(false);
    expect(view.throttle?.applied_error).toBe('scaler unavailable');
  });

  it('keeps the throttle observation absent when the BFF omits it', async () => {
    const body = {
      dimensions: [{ dimension: 'CI_MINUTES', coverage: 'METERED', state: 'WITHIN', value: 1, envelope: 10000, gaps: [] }],
      divergences: [],
      generated_at: '2026-08-15T12:00:00Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    ));
    const view = await usageView(new Request('http://app.gitsaas.test/usage'));
    expect(view.throttle).toBeUndefined();
  });
});
