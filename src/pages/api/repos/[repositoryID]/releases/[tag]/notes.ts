// POST /api/repos/{repositoryID}/releases/{tag}/notes — correct a release's prose
// (T-0066, SPEC-0056 AC13).
//
// The tag comes from the path and the commit is never read from a form: there is no parameter here
// through which editing prose could move a release.
import type { APIRoute } from 'astro';
import { updateReleaseNotes } from '../../../../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const tag = params.tag ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/releases/${encodeURIComponent(tag)}`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?release_outcome=publishRefused`, 303);
  }
  const notes = form.get('notes');
  try {
    await updateReleaseNotes(request, repositoryID, tag, typeof notes === 'string' ? notes : '');
    return redirect(`${back}?release_outcome=notesUpdated`, 303);
  } catch {
    return redirect(`${back}?release_outcome=publishRefused`, 303);
  }
};
