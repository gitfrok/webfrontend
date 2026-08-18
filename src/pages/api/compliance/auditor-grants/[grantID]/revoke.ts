// POST /api/compliance/auditor-grants/{grantID}/revoke (T-0052, SPEC-0051 AC5).
//
// An HTML form speaks GET and POST only, so revocation posts here and this
// route issues the upstream DELETE. Keeping it a form rather than client
// script is what lets the control render unconditionally — AC7's "no
// affordance is a permission claim" without a script that could decide
// otherwise.
import type { APIRoute } from 'astro';
import { revokeAuditorGrant } from '../../../../../lib/bff';

export const prerender = false;

const page = '/compliance/auditor-grants';

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const grantID = params.grantID ?? '';
  try {
    await revokeAuditorGrant(request, grantID);
    return redirect(`${page}?grant_outcome=revoked`, 303);
  } catch {
    return redirect(`${page}?grant_outcome=notApplied`, 303);
  }
};
