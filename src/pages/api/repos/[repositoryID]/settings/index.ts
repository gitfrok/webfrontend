// POST /api/repos/{repositoryID}/settings — change the name and description
// (T-0070, SPEC-0057 AC15).
//
// A plain form posts here; this route forwards under the session and redirects
// back. There is no visibility, member or protection field to forward, because
// the contract has none — a field added to this form would have nowhere to go.
import type { APIRoute } from 'astro';
import { updateRepositorySettings, BffWriteError } from '../../../../../lib/bff';

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
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  const name = field('name');
  if (!name) return redirect(`${back}?settings_outcome=nameRequired`, 303);

  try {
    await updateRepositorySettings(request, repositoryID, name, field('description'));
    return redirect(`${back}?settings_outcome=saved`, 303);
  } catch (error) {
    // A 400 means the name was empty, which the reader can see in the form they
    // just submitted — worth saying rather than folding into the coarse
    // refusal. Branching on the status rather than the message keeps the copy
    // free to change without breaking this.
    const nameProblem = error instanceof BffWriteError && error.status === 400;
    return redirect(`${back}?settings_outcome=${nameProblem ? 'nameRequired' : 'refused'}`, 303);
  }
};
