// T-0080 / SPEC-0063 AC6, AC7 — the bell's wire behaviour and relays.
//
// Same discipline as the other bff suites: assert the WIRE. The count must
// marshal zero as zero (the bell renders absence honestly), mark-read must
// forward exactly one opaque ID decoded once, and every refusal is one coarse
// failure — never an empty list a reader could misread as "nothing happened".
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import {
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
} from '../src/lib/bff';
import { GET as listRoute } from '../src/pages/api/notifications/index';
import { POST as markRoute } from '../src/pages/api/notifications/[notificationID]/mark_read';

const request = (path = '/notifications', method = 'GET') =>
  new Request(`http://app.gitsaas.test${path}`, {
    method,
    headers: { cookie: '__Host-gitfrok_session=abc' },
  });

function ok(payload: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

describe('SPEC-0063 AC7 — reading the list', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards the session cookie and shapes rows untouched', async () => {
    const fetchMock = ok({
      notifications: [{
        id: 'evt-1:author', kind: 'REVIEW_SUBMITTED', repository_id: 'repo-1',
        merge_request_id: 'mr-1', actor_id: 'reviewer', head_revision: '',
        occurred_at: '2026-08-21T12:00:00Z', read: false,
      }],
      next_page_token: 'tok-9',
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = await listNotifications(request(), 50, 'tok-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/v1/notifications');
    expect(url.searchParams.get('page_size')).toBe('50');
    expect(url.searchParams.get('page_token')).toBe('tok-1');
    expect((init.headers as Headers).get('cookie')).toBe('__Host-gitfrok_session=abc');
    expect(page.notifications).toHaveLength(1);
    expect(page.next_page_token).toBe('tok-9');
  });

  it('renders an empty page, never a failed read dressed as one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 404 })));
    await expect(listNotifications(request())).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0063 AC7 — the count is exact', () => {
  afterEach(() => vi.restoreAllMocks());

  it('zero is zero, not an error and not a badge', async () => {
    vi.stubGlobal('fetch', ok({ unread: 0 }));
    await expect(unreadNotificationCount(request())).resolves.toBe(0);
  });

  it('a failed read throws rather than reporting zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 404 })));
    await expect(unreadNotificationCount(request())).rejects.toThrow(/unavailable/i);
  });
});

describe('SPEC-0063 AC6 — marking one marks one', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs to the row\'s own route with the ID encoded once', async () => {
    const fetchMock = ok({ id: 'evt 9:author', kind: 'MERGE_REQUEST_MERGED', repository_id: 'repo-1', occurred_at: '2026-08-21T12:00:00Z', read: true });
    vi.stubGlobal('fetch', fetchMock);
    const row = await markNotificationRead(request(), 'evt 9:author');
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/v1/notifications/evt%209%3Aauthor/mark_read');
    expect(row.read).toBe(true);
  });

  it('refuses to compile a request without an ID', async () => {
    const fetchMock = ok({});
    vi.stubGlobal('fetch', fetchMock);
    await expect(markNotificationRead(request(), '')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the SSR relays', () => {
  afterEach(() => vi.restoreAllMocks());

  it('list relay returns JSON; a refused session is a coarse 404', async () => {
    vi.stubGlobal('fetch', ok({ notifications: [], next_page_token: '' }));
    const response = await listRoute({ request: request('/api/notifications'), params: {} } as APIContext);
    expect(response.status).toBe(200);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));
    const refusedResponse = await listRoute({ request: request('/api/notifications'), params: {} } as APIContext);
    expect(refusedResponse.status).toBe(404);
  });

  it('mark-read relay lands on the list with an outcome word', async () => {
    vi.stubGlobal('fetch', ok({ id: 'x', read: true }));
    const response = await markRoute({
      request: request('/api/notifications/x/mark_read', 'POST'),
      params: { notificationID: 'x' },
    } as unknown as APIContext);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('notification_outcome=marked');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));
    const failed = await markRoute({
      request: request('/api/notifications/x/mark_read', 'POST'),
      params: { notificationID: 'x' },
    } as unknown as APIContext);
    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toContain('notification_outcome=mark-failed');
  });
});
