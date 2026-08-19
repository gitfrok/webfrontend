// POST .../external_issues/unlink — remove a reference by tracker and key
// (T-0076, SPEC-0059 AC16).
//
// By identity rather than by position: a positional remove is a race between two
// readers of the same merge request, and the loser removes something they were not
// looking at.
import type { APIRoute } from 'astro';
import { unlinkExternalIssue } from '../../../../../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const mergeRequestID = params.mergeRequestID ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?issue_outcome=refused`, 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  try {
    await unlinkExternalIssue(request, repositoryID, mergeRequestID, field('tracker'), field('issue_key'));
    return redirect(`${back}?issue_outcome=unlinked`, 303);
  } catch {
    return redirect(`${back}?issue_outcome=refused`, 303);
  }
};
