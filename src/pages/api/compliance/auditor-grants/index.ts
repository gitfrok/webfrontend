// POST /api/compliance/auditor-grants — issue a grant (T-0052, SPEC-0051 AC1).
import type { APIRoute } from 'astro';
import { issueAuditorGrant } from '../../../../lib/bff';

export const prerender = false;

const page = '/compliance/auditor-grants';

export const POST: APIRoute = async ({ request, redirect }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${page}?grant_outcome=notApplied`, 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  const instant = (day: string) => (day ? `${day}T00:00:00Z` : '');

  try {
    await issueAuditorGrant(request, {
      auditor_principal_id: field('auditor_principal_id'),
      range_from: instant(field('range_from')),
      range_to: instant(field('range_to')),
      repository_id: field('repository_id'),
      // One pack per line, blanks dropped. An empty list is refused by the
      // client rather than sent, because the BFF refuses it as the same
      // coarse 404 as everything else.
      pack_ids: field('pack_ids').split('\n').map((line) => line.trim()).filter(Boolean),
      expires_at: instant(field('expires_at')),
    });
    // The issued grant is not passed through the URL: the list below re-reads
    // it from the server, which is the only place its expiry and state are
    // true (SPEC-0051 AC2, AC4).
    return redirect(`${page}?grant_outcome=issued`, 303);
  } catch {
    return redirect(`${page}?grant_outcome=notApplied`, 303);
  }
};
