// POST /api/compliance/evidence-packs — the browser-facing half of requesting
// an evidence pack (T-0051, SPEC-0050 AC1).
//
// A plain HTML form posts here; this route forwards to the BFF as JSON under
// the session cookie and redirects to the pack it created. The browser never
// holds a BFF address, and the control works with no client script.
import type { APIRoute } from 'astro';
import { requestEvidencePack } from '../../../../lib/bff';

export const prerender = false;

const page = '/compliance/evidence-packs';

export const POST: APIRoute = async ({ request, redirect }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${page}?evidence_outcome=requestRefused`, 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  // A date input gives a day; the contract wants an instant. The range is
  // closed at the start of the from-day and the start of the to-day, which is
  // the reading the form's own labels state.
  const instant = (day: string) => (day ? `${day}T00:00:00Z` : '');

  try {
    const pack = await requestEvidencePack(request, {
      range_from: instant(field('range_from')),
      range_to: instant(field('range_to')),
      repository_id: field('repository_id'),
    });
    return redirect(`${page}?pack_id=${encodeURIComponent(pack.pack_id)}`, 303);
  } catch {
    return redirect(`${page}?evidence_outcome=requestRefused`, 303);
  }
};
