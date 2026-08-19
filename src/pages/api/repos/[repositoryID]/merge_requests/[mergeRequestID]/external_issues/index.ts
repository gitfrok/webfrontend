// POST /api/repos/{repositoryID}/merge_requests/{mergeRequestID}/external_issues
// — reference an issue in the customer's tracker (T-0076, SPEC-0059 AC16).
//
// It forwards and redirects. Nothing here fetches the URL, checks that the issue
// exists, or asks the tracker anything: this product references issues, it does not
// know them.
import type { APIRoute } from 'astro';
import { linkExternalIssue, BffWriteError } from '../../../../../../../lib/bff';

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
    await linkExternalIssue(request, repositoryID, mergeRequestID, field('tracker'), field('issue_key'), field('url'));
    return redirect(`${back}?issue_outcome=linked`, 303);
  } catch (error) {
    // The two outcomes the backend distinguishes are facts the reader already has:
    // what they just typed, and how many references this merge request carries.
    // Branching on the status rather than the message keeps the copy free to change.
    if (error instanceof BffWriteError && error.status === 400) {
      return redirect(`${back}?issue_outcome=invalid`, 303);
    }
    if (error instanceof BffWriteError && error.status === 409) {
      return redirect(`${back}?issue_outcome=full`, 303);
    }
    return redirect(`${back}?issue_outcome=refused`, 303);
  }
};
