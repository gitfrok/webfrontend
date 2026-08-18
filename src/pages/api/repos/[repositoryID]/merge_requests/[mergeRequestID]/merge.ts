// POST /api/repos/{repositoryID}/merge_requests/{mergeRequestID}/merge
// (T-0049, SPEC-0048 AC3, AC4, AC5).
//
// This route carries no opinion about whether the merge should be allowed.
// The backend's merge gate decides; a refusal arrives here as the same coarse
// 404 as a dead session, and the copy this route selects says only that the
// action did not take effect.
import type { APIRoute } from 'astro';
import { mergeMergeRequest, mergeRequest } from '../../../../../../lib/bff';
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
    await mergeMergeRequest(request, repositoryID, mergeRequestID, expectedVersion);
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
