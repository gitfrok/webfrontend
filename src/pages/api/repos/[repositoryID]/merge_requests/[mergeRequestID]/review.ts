// POST /api/repos/{repositoryID}/merge_requests/{mergeRequestID}/review
// (T-0049, SPEC-0048 AC2, AC4, AC5).
import type { APIRoute } from 'astro';
import { submitMergeRequestReview, mergeRequest, MR_DISPOSITION_WIRE, type MRDispositionKey } from '../../../../../../lib/bff';
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
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  const disposition = field('disposition') as MRDispositionKey;
  const expectedVersion = Number.parseInt(field('expected_version'), 10);

  try {
    if (!(disposition in MR_DISPOSITION_WIRE)) throw new Error('merge request unavailable');
    await submitMergeRequestReview(request, repositoryID, mergeRequestID, {
      disposition,
      comment: field('comment'),
      head_revision: field('head_revision'),
      expected_version: expectedVersion,
    });
    return redirect(`${back}?mr_outcome=applied`, 303);
  } catch {
    return redirect(`${back}?mr_outcome=${await outcomeKey(request, repositoryID, mergeRequestID, expectedVersion)}`, 303);
  }
};

/**
 * Re-reads the merge request so a refusal can be told apart from a stale one.
 * The re-read failing is not evidence the merge request changed, so it does
 * not become a staleness claim (SPEC-0048 AC5).
 */
async function outcomeKey(request: Request, repositoryID: string, mergeRequestID: string, submitted: number): Promise<string> {
  let reread = null;
  try {
    reread = await mergeRequest(request, repositoryID, mergeRequestID);
  } catch {
    reread = null;
  }
  return classifyWriteOutcome({ submittedVersion: submitted, reread }).messageKey;
}
