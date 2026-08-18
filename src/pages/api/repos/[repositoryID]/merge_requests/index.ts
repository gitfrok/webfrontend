// POST /api/repos/{repositoryID}/merge_requests — the browser-facing half of
// opening a merge request (T-0049, SPEC-0048 AC1).
//
// A plain HTML form posts here and this route forwards to the BFF with the
// session cookie, exactly as api/security/triage.ts does for triage. The
// browser never holds a BFF address. It works with JavaScript disabled, which
// is what keeps AC6 honest: the controls are markup, not a script that could
// decide not to render them.
import type { APIRoute } from 'astro';
import { openMergeRequest } from '../../../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/tree/main/`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?mr_outcome=notApplied`, 303);
  }

  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  try {
    const created = await openMergeRequest(request, repositoryID, {
      source_ref: field('source_ref'),
      target_ref: field('target_ref'),
      title: field('title'),
      description: field('description'),
    });
    return redirect(
      `/repos/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(created.merge_request_id)}?mr_outcome=applied`,
      303,
    );
  } catch {
    // Opening has no prior version to compare against, so there is no
    // staleness to report — only that it did not take effect.
    return redirect(`${back}?mr_outcome=notApplied`, 303);
  }
};
