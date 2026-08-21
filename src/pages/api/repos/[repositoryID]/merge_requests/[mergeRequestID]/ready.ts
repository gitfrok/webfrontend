// POST /api/repos/{repositoryID}/merge_requests/{mergeRequestID}/ready
// (ADR-0087, SPEC-0064 AC3, AC7).
//
// The draft's one door out. Like merge, this route carries no opinion about
// whether the transition should be allowed: the backend's state machine
// decides, and a refusal arrives as the same coarse 404 every other write
// produces.
import type { APIRoute } from 'astro';
import { markMergeRequestReady, mergeRequest } from '../../../../../../lib/bff';
import { classifyWriteOutcome } from '../../../../../../lib/mrAction';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const repositoryID = params.repositoryID ?? '';
  const mergeRequestID = params.mergeRequestID ?? '';
  const back = `/repos/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}`;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect(`${back}?mr_outcome=notApplied`, 303);
  }
  const raw = form.get('expected_version');
  const expectedVersion = Number.parseInt(typeof raw === 'string' ? raw : '', 10);

  try {
    await markMergeRequestReady(request, repositoryID, mergeRequestID, expectedVersion);
    return redirect(`${back}?mr_outcome=applied`, 303);
  } catch {
    let reread = null;
    try {
      reread = await mergeRequest(request, repositoryID, mergeRequestID);
    } catch {
      reread = null;
    }
    const key = classifyWriteOutcome({ submittedVersion: expectedVersion, reread }).messageKey;
    return redirect(`${back}?mr_outcome=${key}`, 303);
  }
};
