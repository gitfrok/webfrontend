// POST /api/repos/{repositoryID}/settings/archive — set or clear the archived
// label (T-0070, SPEC-0057 AC17).
//
// The form states the state wanted. There is no toggle route, deliberately: a
// person cannot tell a slow response from a lost one, and a toggle would flip
// the state on the resubmission that finding out requires.
import type { APIRoute } from 'astro';
import { setRepositoryArchived } from '../../../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/settings`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?settings_outcome=refused`, 303);
  }
  const wanted = form.get('archived') === 'true';

  try {
    await setRepositoryArchived(request, repositoryID, wanted);
    return redirect(`${back}?settings_outcome=${wanted ? 'archived' : 'unarchived'}`, 303);
  } catch {
    return redirect(`${back}?settings_outcome=refused`, 303);
  }
};
