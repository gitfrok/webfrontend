// The notifications list relay (SPEC-0063, T-0080). A thin proxy to the BFF's
// GET /v1/notifications: identity comes only from the forwarded session
// cookie, and a refusal is one coarse 404 — never an empty list.
export const prerender = false;

export async function GET({ request }: { request: Request }) {
  const { listNotifications } = await import('../../../lib/bff');
  const url = new URL(request.url);
  const pageSize = Number(url.searchParams.get('page_size') ?? '0') || 0;
  const pageToken = url.searchParams.get('page_token') ?? '';
  try {
    const page = await listNotifications(request, pageSize, pageToken);
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 404 });
  }
}
