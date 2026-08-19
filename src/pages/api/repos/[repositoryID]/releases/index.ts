// POST /api/repos/{repositoryID}/releases — publish a release (T-0066, SPEC-0056 AC13).
//
// A plain form posts here; this route forwards under the session and redirects back. The tag is
// chosen from the tags the page listed, and the commit is resolved server-side — there is no field
// here through which a caller could name one.
import type { APIRoute } from 'astro';
import { publishRelease, BffWriteError } from '../../../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/releases`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?release_outcome=publishRefused`, 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  const tag = field('tag');
  if (!tag) return redirect(`${back}?release_outcome=publishRefused`, 303);

  try {
    await publishRelease(request, repositoryID, tag, field('notes'));
    return redirect(`${back}?release_outcome=published`, 303);
  } catch (error) {
    // A 409 means the tag already has a release — a conflict with a state the
    // reader can see on this very page, and worth saying rather than folding
    // into the coarse refusal. Branching on the status rather than the message
    // keeps the copy free to change without breaking this.
    const conflict = error instanceof BffWriteError && error.status === 409;
    return redirect(`${back}?release_outcome=${conflict ? 'alreadyPublished' : 'publishRefused'}`, 303);
  }
};
