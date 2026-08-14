// POST /api/security/triage — the browser-facing half of the triage control
// action (T-0023, SPEC-0026 AC4). The browser never holds a BFF address: it
// posts to this SSR endpoint, which forwards the session cookie and the
// decision to the BFF and passes the answer back unchanged. The backend is
// the PDP; this route shapes and relays only, and every failure — malformed
// body, dead BFF, or a backend refusal — is the same coarse 404 that
// distinguishes nothing (SPEC-0001).
import type { APIRoute } from 'astro';
import { setSecurityTriage } from '../../../lib/bff';

const maxJustificationChars = 2000;

function denied(): Response {
  return new Response('security unavailable', {
    status: 404,
    headers: { 'cache-control': 'private, no-store' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return denied();
  }
  const input = body as Record<string, unknown>;
  const justification = typeof input.justification === 'string' ? input.justification.slice(0, maxJustificationChars) : '';
  try {
    const record = await setSecurityTriage(request, {
      finding_id: typeof input.finding_id === 'string' ? input.finding_id : '',
      state: typeof input.state === 'string' ? input.state : '',
      justification,
      expected_version: typeof input.expected_version === 'number' ? input.expected_version : -1,
    });
    return new Response(JSON.stringify(record), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  } catch {
    return denied();
  }
};
