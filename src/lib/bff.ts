// BFF client — the only upstream the web frontend has (invariant 22, SPEC-0021).
//
// The webfrontend is server-rendered (ADR-0020); every data fetch here runs on
// the Astro server and talks to the BFF over HTTP. It never holds a backend
// address, a gRPC client, a storage client, or a credential: identity travels
// in the browser's session cookie, which the SSR fetch forwards unchanged.
import type { BrowserTreeEntry, TreeView, FileViewMetadata } from '../gen/proto/bff/v1/browser_pb.js';
import type { ImportedHistoryView } from './provenance.js';
import { readPackStream, type PackStreamResult } from './evidenceStream.js';

// bffOrigin is the sole per-environment upstream. In a cluster it is the BFF
// Service; in local dev it is the host the SSR server runs on. Astro exposes
// server-side env to the node adapter at build time; the value is set by the
// deployment, never compiled in by the frontend itself.
export const bffOrigin = (import.meta.env.GITFROK_BFF_ORIGIN as string | undefined) ?? 'http://bff:8080';

// bffFetch forwards the incoming request's session cookie so the BFF resolves
// the browser's identity. The SSR layer is a thin proxy: it does not parse,
// cache, or decide anything about the response.
function bffFetch(request: Request, path: string): Promise<Response> {
  const url = new URL(path, bffOrigin);
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  return fetch(url, { headers, redirect: 'manual' });
}

export interface TreeResult {
  entries: BrowserTreeEntry[];
  nextPageToken: string;
}

// tree lists the entries under one revision (SPEC-0021 GET /tree).
export async function tree(request: Request, repositoryID: string, revision: string, pageToken = ''): Promise<TreeResult> {
  const params = new URLSearchParams({ revision });
  if (pageToken) params.set('page_token', pageToken);
  const response = await bffFetch(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/tree?${params}`);
  if (!response.ok) {
    throw new Error('tree unavailable');
  }
  const view = (await response.json()) as TreeView;
  return { entries: view.entries ?? [], nextPageToken: view.nextPageToken ?? '' };
}

export interface FileResult {
  metadata: FileViewMetadata | null;
  // body is the raw file bytes (spec: streamed, private, uncacheable).
  body: ArrayBuffer;
}

// file streams one file's bytes (SPEC-0021 GET /file).
export async function file(request: Request, repositoryID: string, revision: string, path: string): Promise<FileResult> {
  const params = new URLSearchParams({ revision, path });
  const response = await bffFetch(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/file?${params}`);
  if (!response.ok) {
    throw new Error('file unavailable');
  }
  const metadataHeader = response.headers.get('x-gitfrok-file-metadata');
  let metadata: FileViewMetadata | null = null;
  if (metadataHeader) {
    try {
      metadata = JSON.parse(metadataHeader) as FileViewMetadata;
    } catch {
      // A malformed metadata header is still a refusal to present the file,
      // not a reason to guess at its shape.
      throw new Error('file unavailable');
    }
  }
  return { metadata, body: await response.arrayBuffer() };
}

// diff streams a Git patch between two revisions (SPEC-0021 GET /diff).
export async function diff(request: Request, repositoryID: string, baseRevision: string, headRevision: string, path = ''): Promise<string> {
  const params = new URLSearchParams({ base_revision: baseRevision, head_revision: headRevision });
  if (path) params.set('path', path);
  const response = await bffFetch(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/diff?${params}`);
  if (!response.ok) {
    throw new Error('diff unavailable');
  }
  return response.text();
}

// mergeRequestView is the minimal MR shape the web page consumes (SPEC-0009).
export interface MergeRequestView {
  merge_request_id: string;
  repository_id: string;
  source_ref: string;
  target_ref: string;
  title: string;
  description: string;
  creator_id: string;
  state: string;
  head_revision: string;
  version: number;
  created_at: string;
  /**
   * References to issues in the customer's own tracker (SPEC-0059).
   *
   * Pointers, not copies: there is no title and no state, because this product
   * never asks the tracker anything. Optional because a merge request read before
   * this field existed carries none.
   */
  external_issues?: ExternalIssueView[];
}

/** One reference to an issue this product does not store (SPEC-0059). */
export interface ExternalIssueView {
  tracker: string;
  issue_key: string;
  url: string;
  linked_by: string;
  linked_at: string;
}

// mergeRequest fetches one MR from the BFF (minimal T-0016 web bar).
export async function mergeRequest(request: Request, repositoryID: string, mergeRequestID: string): Promise<MergeRequestView> {
  const response = await bffFetch(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}`);
  if (!response.ok) {
    throw new Error('merge request unavailable');
  }
  return (await response.json()) as MergeRequestView;
}

// importedHistory fetches one page of an import's imported review history
// (SPEC-0011 AC20, the read the AC23 rendering depends on).
//
// The response is passed through unchanged. Provenance is decided by the
// backend and shaped by the BFF; this layer classifies nothing, so it cannot
// misclassify anything.
export async function importedHistory(
  request: Request,
  repositoryID: string,
  importID: string,
  pageToken = '',
): Promise<ImportedHistoryView> {
  const params = new URLSearchParams();
  if (pageToken) params.set('page_token', pageToken);
  const query = params.toString();
  const response = await bffFetch(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/imports/${encodeURIComponent(importID)}/history${query ? `?${query}` : ''}`,
  );
  if (!response.ok) {
    throw new Error('imported history unavailable');
  }
  const view = (await response.json()) as ImportedHistoryView;
  return { merge_requests: view.merge_requests ?? [], next_page_token: view.next_page_token ?? '' };
}

// --- Unified security dashboard (T-0023, SPEC-0026, SPEC-0027) --------------
//
// The backend is the PDP for findings.read, findings.summary.read and
// findings.triage; the BFF aggregates and shapes only. This layer forwards
// the session cookie and passes results through untouched: it filters,
// counts and authorizes nothing, so an empty page and a refusal are the
// only shapes an unauthorized caller can ever observe here.

// SecurityFilters mirrors the dashboard filter set with the contract's
// UNSPECIFIED/empty/zero semantics: an absent value is no filter, and which
// findings survive is the backend's decision alone (SPEC-0026 AC2).
export interface SecurityFilters {
  repository?: string;
  scanner_class?: string;
  severity?: string;
  lifecycle?: string;
  min_age_days?: number;
  max_age_days?: number;
  owning_team?: string;
}

// SecurityFindingView is one authorized finding as the BFF shapes it. It
// carries no triage field — triage is a resource keyed by finding identity,
// never a field of the finding (SPEC-0027).
export interface SecurityFindingView {
  finding_id: string;
  repository_id: string;
  scanner_class: string;
  tool_name: string;
  tool_version: string;
  rule_id: string;
  severity: string;
  lifecycle: string;
  artifact_path: string;
  enclosing_content: string;
  component: string;
  component_version: string;
  first_seen_scan_id: string;
  last_seen_scan_id: string;
  provenance?: string;
  provenance_media_type?: string;
}

export interface SecurityFindingPage {
  findings: SecurityFindingView[];
  next_page_token: string;
}

export interface SecurityFacetValue {
  value: string;
  count: number;
}

export interface SecurityFacet {
  dimension: string;
  values: SecurityFacetValue[];
}

export interface SecuritySummary {
  total_count: number;
  facets: SecurityFacet[];
}

// SecurityTriageView is the triage record now in force, as the BFF returns
// it after SetTriage.
export interface SecurityTriageView {
  triage_id: string;
  finding_id: string;
  repository_id: string;
  state: string;
  justification: string;
  version: number;
  actor_id: string;
  occurred_at: string;
}

// securityFilterParams renders only the filters the caller actually set: the
// empty/zero values carry their no-filter meaning and must not travel.
function securityFilterParams(filters: SecurityFilters, params: URLSearchParams): void {
  if (filters.repository) params.set('repository', filters.repository);
  if (filters.scanner_class) params.set('scanner_class', filters.scanner_class);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.lifecycle) params.set('lifecycle', filters.lifecycle);
  if (filters.min_age_days) params.set('min_age_days', String(filters.min_age_days));
  if (filters.max_age_days) params.set('max_age_days', String(filters.max_age_days));
  if (filters.owning_team) params.set('owning_team', filters.owning_team);
}

// securityDashboard pages the caller's authorized findings under the filter
// set (SPEC-0026 AC1/AC2). Membership, order and the cursor all come from
// the backend untouched.
export async function securityDashboard(
  request: Request,
  filters: SecurityFilters,
  pageSize: number,
  pageToken = '',
): Promise<SecurityFindingPage> {
  const params = new URLSearchParams();
  securityFilterParams(filters, params);
  if (pageSize > 0) params.set('page_size', String(pageSize));
  if (pageToken) params.set('page_token', pageToken);
  const response = await bffFetch(request, `/api/v1/security/dashboard?${params}`);
  if (!response.ok) {
    throw new Error('security dashboard unavailable');
  }
  const view = (await response.json()) as SecurityFindingPage;
  return { findings: view.findings ?? [], next_page_token: view.next_page_token ?? '' };
}

// securityFindingsSummary reads counts and facets computed under the
// caller's authorization (SPEC-0027 AC4). The dimensions are the ones the
// contract names; which values exist is the backend's answer alone.
export async function securityFindingsSummary(
  request: Request,
  filters: SecurityFilters,
  facetDimensions: string[],
): Promise<SecuritySummary> {
  const params = new URLSearchParams();
  securityFilterParams(filters, params);
  for (const dimension of facetDimensions) params.append('facet', dimension);
  const response = await bffFetch(request, `/api/v1/security/findings/summary?${params}`);
  if (!response.ok) {
    throw new Error('security dashboard unavailable');
  }
  const view = (await response.json()) as SecuritySummary;
  return { total_count: view.total_count ?? 0, facets: view.facets ?? [] };
}

// triageStates is the decision vocabulary a triage record may carry
// (SPEC-0026). Anything else is not a decision this surface can record.
export const triageStates = ['ACCEPT', 'FALSE_POSITIVE', 'FIX', 'DEFER'] as const;

// setSecurityTriage forwards one triage decision to the BFF under the
// session's identity (SPEC-0026 AC4). The shape is validated here only so a
// malformed browser request is refused with the same coarse denial the BFF
// would return — this layer still decides nothing about the outcome.
export async function setSecurityTriage(
  request: Request,
  input: { finding_id: string; state: string; justification: string; expected_version: number },
): Promise<SecurityTriageView> {
  if (
    typeof input.finding_id !== 'string' || input.finding_id === '' ||
    !triageStates.includes(input.state as (typeof triageStates)[number]) ||
    typeof input.justification !== 'string' ||
    typeof input.expected_version !== 'number' || !Number.isInteger(input.expected_version) || input.expected_version < 0
  ) {
    throw new Error('security dashboard unavailable');
  }
  const url = new URL('/api/v1/security/triage', bffOrigin);
  const headers = new Headers({ 'content-type': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      finding_id: input.finding_id,
      state: input.state,
      justification: input.justification,
      expected_version: input.expected_version,
    }),
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new Error('security dashboard unavailable');
  }
  return (await response.json()) as SecurityTriageView;
}

// --- Findings inline on the merge request (T-0024, SPEC-0028) ---------------
//
// Findings render on the merge request that introduced them: the backend
// computes attribution as the set difference between the scan at the MR's
// head revision and the scan at the merge base, under server-derived
// authorization, and the BFF shapes the authorized page field for field.
// This layer forwards the session cookie and passes the page through
// untouched: it attributes, filters and authorizes nothing, so a refusal is
// one coarse failure and an empty list is only ever served with the summary
// that says what was compared (SPEC-0028 AC7).

// MRFindingsFilters mirrors the MR-findings filter set with the contract's
// UNSPECIFIED/empty/zero semantics: an absent value is no filter, and which
// findings survive is the backend's decision alone (SPEC-0028 AC8).
export interface MRFindingsFilters {
  scanner_class?: string;
  severity?: string;
  attribution?: string;
}

// The filter vocabularies the contract names. A value outside these sets is
// refused here with the same coarse failure the BFF would return — a filter
// the contract does not name is not a request this surface can send.
export const mrScannerClasses = ['SAST', 'DEPENDENCY', 'SECRETS', 'CONTAINER', 'DAST'] as const;
export const mrSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const mrAttributions = ['ATTRIBUTED', 'PRE_EXISTING', 'UNAVAILABLE'] as const;

// MRFindingLocationView is a finding's location as resolved at the MR's
// current head revision. Identity is revision-invariant (SPEC-0024), so a
// later push that shifts the line re-resolves this location without changing
// the finding it belongs to (SPEC-0028 AC4).
export interface MRFindingLocationView {
  artifact_path: string;
  enclosing_content: string;
  component: string;
  component_version: string;
}

// MRFindingView is one finding as the merge request renders it: the finding,
// the triage state attached to its identity, its head-revision location, and
// its attribution status. Triage is absent exactly when no triage decision
// has been recorded — the only meaning of absence here (SPEC-0027).
export interface MRFindingView {
  finding: SecurityFindingView;
  triage?: SecurityTriageView;
  head_location: MRFindingLocationView;
  attribution: string;
  // Set only when attribution is UNAVAILABLE: the honest reason the
  // comparison cannot be computed (SPEC-0028 AC7).
  unavailable_reason?: string;
}

// AttributionSummary is the response-level statement of what was compared
// and what the comparison produced. It is always present: the shape has no
// way to say "no findings" without also saying what was compared.
export interface AttributionSummary {
  status: string;
  // Set only when status is UNAVAILABLE.
  unavailable_reason?: string;
  head_revision: string;
  merge_base_revision: string;
  stale: boolean;
  attributed_low: number;
  attributed_medium: number;
  attributed_high: number;
  attributed_critical: number;
}

// MRFindingsPage is one authorized MR-findings page. An empty findings list
// is a legitimate answer only when the summary says attribution was computed
// and found nothing; an UNAVAILABLE summary with an empty list is still
// UNAVAILABLE, never "no findings" (SPEC-0028 AC7).
export interface MRFindingsPage {
  findings: MRFindingView[];
  next_page_token: string;
  summary: AttributionSummary;
}

// mergeRequestFindings pages the findings a merge request introduced under
// the session's identity. The merge request travels as its opaque identity
// only — the route carries no repository segment, because the contract's
// request has no repository field to carry one. Membership, order,
// attribution and counts come from the backend untouched.
export async function mergeRequestFindings(
  request: Request,
  mergeRequestID: string,
  filters: MRFindingsFilters,
  pageSize: number,
  pageToken = '',
): Promise<MRFindingsPage> {
  if (
    mergeRequestID === '' ||
    (filters.scanner_class !== undefined && !mrScannerClasses.includes(filters.scanner_class as (typeof mrScannerClasses)[number])) ||
    (filters.severity !== undefined && !mrSeverities.includes(filters.severity as (typeof mrSeverities)[number])) ||
    (filters.attribution !== undefined && !mrAttributions.includes(filters.attribution as (typeof mrAttributions)[number]))
  ) {
    throw new Error('merge request findings unavailable');
  }
  const params = new URLSearchParams();
  if (filters.scanner_class) params.set('scanner_class', filters.scanner_class);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.attribution) params.set('attribution', filters.attribution);
  if (pageSize > 0) params.set('page_size', String(pageSize));
  if (pageToken) params.set('page_token', pageToken);
  const query = params.toString();
  const response = await bffFetch(
    request,
    `/api/v1/security/merge-requests/${encodeURIComponent(mergeRequestID)}/findings${query ? `?${query}` : ''}`,
  );
  if (!response.ok) {
    throw new Error('merge request findings unavailable');
  }
  const view = (await response.json()) as MRFindingsPage;
  return {
    findings: view.findings ?? [],
    next_page_token: view.next_page_token ?? '',
    summary: view.summary,
  };
}

// --- Fair-use usage view (T-0034, SPEC-0041) --------------------------------
//
// The control plane is the metering authority (ADR-0061): the numbers this
// surface presents are the same counters every envelope decision is made
// from. This layer forwards the session cookie and passes the view through
// untouched — it computes, adjusts and invents nothing. Two rendering rules
// bind the page: a DEFERRED dimension and a telemetry gap have NO value
// field at all, so unmeasured usage can never be shown as zero (SPEC-0041
// AC2, AC3), and a divergence is presented as a health finding carrying
// both numbers, never as a corrected total (SPEC-0041 AC1).

// UsageGapView is one telemetry-less interval (SPEC-0041 AC3).
export interface UsageGapView {
  window_start: string;
  window_end: string;
  reason: string;
}

// UsageDimensionView is one PRD §6 dimension's row. The numeric fields are
// optional by construction: the BFF omits them for DEFERRED rows and
// telemetry gaps, so a row without a value is unmeasured — never zero.
export interface UsageDimensionView {
  dimension: string;
  coverage: 'METERED' | 'DEFERRED' | string;
  state?: string;
  // trend names the direction the control plane's counter moved (SPEC-0046
  // AC2); the BFF omits it on deferred and gapped rows, so a row without a
  // trend has no number for one to describe. Rendered, never derived.
  trend?: 'FLAT' | 'RISING' | 'FALLING' | string;
  value?: number;
  envelope?: number;
  notification?: number;
  unit?: string;
  window_start?: string;
  window_end?: string;
  telemetry_gap?: boolean;
  gaps: UsageGapView[];
  deferred_reason?: string;
}

// UsageDivergenceView is one health finding: the data plane's self-report
// and the control plane's counter disagree over one interval (SPEC-0041
// AC1, ADR-0061 §2).
export interface UsageDivergenceView {
  dimension: string;
  data_plane_id: string;
  control_plane_value: number;
  data_plane_reported_value: number;
  window_start: string;
  window_end: string;
}

// UsageThrottleObservation is SPEC-0046 AC3's end-to-end throttle view: the
// METERED desired state the control plane delivered and the APPLIED ack the
// data plane reported, shown as two halves. The BFF omits the whole object
// until the tenant has an evaluation, and the applied_* fields until an ack
// is recorded — absence renders as absence.
export interface UsageThrottleObservation {
  desired_generation: number;
  desired_max_ci_concurrency: number;
  desired_queue_depth_cap: number;
  has_applied_ack: boolean;
  applied_generation?: number;
  applied?: boolean;
  applied_error?: string;
  acked_at?: string;
}

// UsageViewResponse is the tenant's fair-use usage view. The dimensions
// list itself is the coverage statement: every PRD §6 dimension appears
// exactly once, metered or deferred with its reason (SPEC-0041 AC2).
export interface UsageViewResponse {
  dimensions: UsageDimensionView[];
  divergences: UsageDivergenceView[];
  throttle?: UsageThrottleObservation;
  generated_at: string;
}

// usageView fetches the usage view from the BFF under the session's
// identity. Any refusal is one coarse failure — the page never invents an
// empty or zeroed view (SPEC-0001).
export async function usageView(request: Request): Promise<UsageViewResponse> {
  const response = await bffFetch(request, '/api/v1/usage/view');
  if (!response.ok) {
    throw new Error('usage view unavailable');
  }
  const view = (await response.json()) as UsageViewResponse;
  return {
    dimensions: view.dimensions ?? [],
    divergences: view.divergences ?? [],
    throttle: view.throttle,
    generated_at: view.generated_at,
  };
}

// --- merge-request writes (T-0049, SPEC-0048 AC1–AC3) ---------------------
//
// These three are the only writes in this file that are FORM-ENCODED, and the
// difference is not cosmetic: the BFF's mr handler parses them with
// `r.ParseForm()` and reads `PostFormValue`, so a JSON body arrives as no
// fields at all and is refused with the same coarse 404 as a dead session.
// `setSecurityTriage` above posts JSON and is not a template for these.
//
// Each write travels with the session cookie and nothing else. No tenant, no
// actor, no role, no approval count, no authorization outcome: the backend
// decides, and this layer would have no way to be right about any of them.

/**
 * The wire vocabulary for a review disposition.
 *
 * The BFF resolves the posted string through
 * `codereviewv1.ReviewDisposition_value[disposition]` — a Go map lookup, which
 * yields 0 (`REVIEW_DISPOSITION_UNSPECIFIED`) for a key it does not hold, with
 * no error anywhere. So `APPROVE` — the obvious string, and the one the
 * backend's own domain type uses internally — would travel as UNSPECIFIED, be
 * refused by `validDisposition`, and surface as the same 404 as everything
 * else: a review button that never works and cannot be diagnosed from either
 * side. The full protobuf enum name is the only thing that works.
 */
export const MR_DISPOSITION_WIRE = {
  APPROVE: 'REVIEW_DISPOSITION_APPROVE',
  REQUEST_CHANGES: 'REVIEW_DISPOSITION_REQUEST_CHANGES',
  COMMENT: 'REVIEW_DISPOSITION_COMMENT',
} as const;

export type MRDispositionKey = keyof typeof MR_DISPOSITION_WIRE;

/**
 * A refused write, carrying the status so a caller can tell one outcome from
 * another without parsing a message.
 *
 * The message stays each surface's own coarse refusal — this class adds a
 * machine-readable status beside it rather than replacing it, because the
 * copy a surface shows and the code a relay branches on are different needs.
 */
export class BffWriteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BffWriteError';
  }
}

/**
 * Posts one form-encoded write to the BFF under the browser's session.
 *
 * Generic in its response because more than one surface writes this way now:
 * the merge-request actions it was written for, and releases. Returning one
 * surface's shape and casting at the call site would put a lie in the types.
 *
 * `unavailable` is the caller's coarse refusal message, because each surface
 * has its own and a shared helper must not flatten them.
 */
async function bffPostForm<T>(
  request: Request,
  path: string,
  fields: Record<string, string>,
  unavailable = 'merge request unavailable',
): Promise<T> {
  const url = new URL(path, bffOrigin);
  const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new BffWriteError(response.status, unavailable);
  }
  return (await response.json()) as T;
}

/**
 * A version this layer is allowed to submit: a non-negative integer that came
 * from a rendered view. A defaulted or invented version is refused before a
 * request is compiled, because the write would otherwise be an optimistic
 * concurrency check against a number nobody read.
 */
function usableVersion(version: number): boolean {
  return typeof version === 'number' && Number.isInteger(version) && version >= 0;
}

/** Opens a merge request (SPEC-0048 AC1). */
export async function openMergeRequest(
  request: Request,
  repositoryID: string,
  input: { source_ref: string; target_ref: string; title: string; description: string },
): Promise<MergeRequestView> {
  if (!repositoryID || !input.source_ref || !input.target_ref || !input.title) {
    throw new Error('merge request unavailable');
  }
  return bffPostForm<MergeRequestView>(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests`, {
    source_ref: input.source_ref,
    target_ref: input.target_ref,
    title: input.title,
    description: input.description ?? '',
  });
}

/**
 * Submits a review (SPEC-0048 AC2).
 *
 * `head_revision` is mandatory: the backend refuses an empty one, and the
 * refusal is indistinguishable from every other refusal, so it is caught here
 * where the cause is still visible.
 */
export async function submitMergeRequestReview(
  request: Request,
  repositoryID: string,
  mergeRequestID: string,
  input: { disposition: MRDispositionKey; comment: string; head_revision: string; expected_version: number },
): Promise<MergeRequestView> {
  const wire = MR_DISPOSITION_WIRE[input.disposition];
  if (!repositoryID || !mergeRequestID || !wire || !input.head_revision || !usableVersion(input.expected_version)) {
    throw new Error('merge request unavailable');
  }
  return bffPostForm<MergeRequestView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}/review`,
    {
      disposition: wire,
      comment: input.comment ?? '',
      head_revision: input.head_revision,
      expected_version: String(input.expected_version),
    },
  );
}

/** Merges a merge request (SPEC-0048 AC3). It carries no opinion about whether it should be allowed. */
export async function mergeMergeRequest(
  request: Request,
  repositoryID: string,
  mergeRequestID: string,
  expectedVersion: number,
): Promise<MergeRequestView> {
  if (!repositoryID || !mergeRequestID || !usableVersion(expectedVersion)) {
    throw new Error('merge request unavailable');
  }
  return bffPostForm<MergeRequestView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}/merge`,
    { expected_version: String(expectedVersion) },
  );
}

// --- evidence packs (T-0051, SPEC-0050 AC1–AC3) ---------------------------
//
// Three routes, and the third behaves unlike anything else in this file: the
// pack stream writes 200 on its first chunk, so a failure after that arrives
// as a truncated body with a success status. `evidencePackStream` therefore
// never throws on truncation — it returns the truncated result, because "this
// pack is incomplete" and "there is no such pack" are different facts and the
// page has to be able to say which one it has.

export interface PackReference {
  pack_id: string;
  state: string;
}

export interface PackSectionStatus {
  type: string;
  record_count: number;
  gaps: { from: string; to: string; reason: string }[];
}

export interface PackStatusView {
  state: string;
  failure_reason?: string;
  sections: PackSectionStatus[];
  appendix_record_count: number;
  range_from: string;
  range_to: string;
  repository_id?: string;
}

/**
 * A closed, ordered, parseable range. The BFF's `ValidatePackRequest` refuses
 * the same shapes, but its refusal is the coarse 404 that names nothing — so
 * the check happens here too, where the cause is still visible to whoever
 * typed it.
 */
function closedRange(from: string, to: string): boolean {
  if (!from || !to) return false;
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) && start < end;
}

/** Requests a pack for a closed range with an optional repository scope. */
export async function requestEvidencePack(
  request: Request,
  input: { range_from: string; range_to: string; repository_id: string },
): Promise<PackReference> {
  if (!closedRange(input.range_from, input.range_to)) {
    throw new Error('evidence pack unavailable');
  }
  const body: Record<string, string> = {
    range_from: input.range_from,
    range_to: input.range_to,
  };
  // An absent scope means "the whole tenant". Sending an empty string would
  // be a scope the contract does not name.
  if (input.repository_id) body.repository_id = input.repository_id;

  const url = new URL('/api/v1/audit/evidence-packs', bffOrigin);
  const headers = new Headers({ 'content-type': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' });
  if (!response.ok) {
    throw new Error('evidence pack unavailable');
  }
  return (await response.json()) as PackReference;
}

/** Reads one pack's assembly state. Counts only; the wire carries no content here. */
export async function evidencePackStatus(request: Request, packID: string): Promise<PackStatusView> {
  if (!packID) throw new Error('evidence pack unavailable');
  const response = await bffFetch(request, `/api/v1/audit/evidence-packs/${encodeURIComponent(packID)}/status`);
  if (!response.ok) {
    throw new Error('evidence pack unavailable');
  }
  return (await response.json()) as PackStatusView;
}

/**
 * Reads one pack's NDJSON stream.
 *
 * Deliberately does not throw on truncation. `readPackStream` owns the
 * completeness judgement, and its `truncated` flag is what the page renders.
 */
export async function evidencePackStream(request: Request, packID: string): Promise<PackStreamResult> {
  if (!packID) {
    return { chunks: [], truncated: true, degraded: false, refused: true };
  }
  const response = await bffFetch(request, `/api/v1/audit/evidence-packs/${encodeURIComponent(packID)}`);
  return readPackStream(response);
}

// --- auditor grants (T-0052, SPEC-0051 AC1, AC3, AC5) ---------------------
//
// The administration surface for PR-18: scoped, read-only, time-boxed access
// to evidence, without repo read access. It never reads what a grant gives
// access to — that separation is the whole of the requirement.
//
// One property governs every function here: **the response is the truth and
// the request is a proposal.** The backend answers an issued grant with the
// expiry it recognized, which may bound the one requested, and it renders the
// grant's state from its own record at response time. Nothing below derives,
// computes or echoes any of that.

export interface AuditorGrantView {
  grant_id: string;
  tenant_id: string;
  auditor_principal_id: string;
  range_from: string;
  range_to: string;
  repository_id?: string;
  pack_ids: string[];
  expires_at: string;
  granted_by: string;
  issued_at: string;
  revoked_at?: string;
  state: string;
}

export interface GrantListView {
  grants: AuditorGrantView[];
}

export interface GrantIssueInput {
  auditor_principal_id: string;
  range_from: string;
  range_to: string;
  repository_id: string;
  pack_ids: string[];
  expires_at: string;
}

/** Posts JSON to the grants surface under the browser's session. */
async function grantsFetch(request: Request, path: string, init: RequestInit): Promise<AuditorGrantView> {
  const url = new URL(path, bffOrigin);
  const headers = new Headers(init.body ? { 'content-type': 'application/json' } : {});
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, { ...init, headers, redirect: 'manual' });
  if (!response.ok) {
    throw new Error('auditor grant unavailable');
  }
  return (await response.json()) as AuditorGrantView;
}

/**
 * Issues a grant.
 *
 * The shapes refused here are the shapes `ValidateGrantIssue` refuses at the
 * BFF, checked again where the cause is still visible: the BFF's refusal is
 * the coarse 404 that names nothing.
 */
export async function issueAuditorGrant(request: Request, input: GrantIssueInput): Promise<AuditorGrantView> {
  const expiry = Date.parse(input.expires_at);
  if (
    !input.auditor_principal_id ||
    !input.pack_ids?.length ||
    !Number.isFinite(expiry) ||
    !closedRange(input.range_from, input.range_to)
  ) {
    throw new Error('auditor grant unavailable');
  }
  const body: Record<string, unknown> = {
    auditor_principal_id: input.auditor_principal_id,
    range_from: input.range_from,
    range_to: input.range_to,
    pack_ids: input.pack_ids,
    expires_at: input.expires_at,
  };
  if (input.repository_id) body.repository_id = input.repository_id;

  return grantsFetch(request, '/api/v1/audit/auditor-grants', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Lists the tenant's grants, optionally narrowed to one auditor principal. */
export async function listAuditorGrants(request: Request, auditorPrincipalID: string): Promise<GrantListView> {
  const params = new URLSearchParams();
  if (auditorPrincipalID) params.set('auditor_principal_id', auditorPrincipalID);
  const query = params.toString();
  const response = await bffFetch(request, `/api/v1/audit/auditor-grants${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('auditor grant unavailable');
  }
  const view = (await response.json()) as Partial<GrantListView>;
  // No grants and no grants field are the same fact here: this tenant has
  // nothing to show. Neither is a failure.
  return { grants: view.grants ?? [] };
}

/** Revokes a grant. Revocation takes effect at the next decision, not here. */
export async function revokeAuditorGrant(request: Request, grantID: string): Promise<AuditorGrantView> {
  if (!grantID) throw new Error('auditor grant unavailable');
  return grantsFetch(request, `/api/v1/audit/auditor-grants/${encodeURIComponent(grantID)}`, { method: 'DELETE' });
}

// --- code search (T-0050, SPEC-0049 AC1–AC3, AC7, AC8) --------------------
//
// PR-19: results filtered by the caller's permissions, never leaking the
// existence of unauthorized content. Two properties of the wire carry that,
// and both are easy to undo from here.
//
// `SearchPage` has **no total**, and SPEC-0035 AC3 makes that a type property
// rather than a convention: there is no field capable of expressing how many
// matches the caller may not see, so nothing downstream can render one. The
// type below keeps that true — a total arriving from anywhere is not part of
// the shape this layer hands on.
//
// The empty page is also the identical shape for "nothing matched" and "every
// match was unauthorized" (SPEC-0035 AC4). This client therefore returns an
// empty page rather than raising, because those are not failures; what the
// page is then allowed to SAY about them is `src/lib/search.ts`'s problem.

/** The three query languages the contract names. Nothing else is a query. */
export const SEARCH_MODES = ['SUBSTRING', 'REGEX', 'SYMBOL'] as const;

export type SearchMode = (typeof SEARCH_MODES)[number];

export interface SearchFileMetadata {
  path: string;
  object_id: string;
  mode: number;
  size_bytes: number;
}

export interface SearchResultView {
  repository_id: string;
  revision: string;
  path: string;
  line_start: number;
  line_end: number;
  matched_content: string;
  metadata?: SearchFileMetadata;
}

export interface SearchPageView {
  results: SearchResultView[];
  next_page_token: string;
}

export interface IndexStatusView {
  repository_id: string;
  last_indexed_revision: string;
  indexed_at: string;
  freshness_lag_ms: number;
}

export interface IndexStatusPageView {
  entries: IndexStatusView[];
}

/**
 * Runs one query.
 *
 * The text travels verbatim, including a regex: the backend owns evaluation
 * and its own resource bounds, and rewriting a pattern here would be this
 * layer deciding what a query means.
 */
export async function searchCode(
  request: Request,
  input: { query: string; mode: SearchMode; page_token: string },
): Promise<SearchPageView> {
  if (!input.query?.trim() || !SEARCH_MODES.includes(input.mode)) {
    throw new Error('search unavailable');
  }
  const url = new URL('/api/v1/search/query', bffOrigin);
  const headers = new Headers({ 'content-type': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    // No repository, scope or offset field: the contract names none of them,
    // and paging is the opaque token or nothing (SPEC-0049 AC8).
    body: JSON.stringify({ query: input.query, mode: input.mode, page_token: input.page_token ?? '' }),
    redirect: 'manual',
  });
  if (!response.ok) {
    throw new Error('search unavailable');
  }
  const page = (await response.json()) as Partial<SearchPageView>;
  // Reshaped rather than passed through, so a total invented anywhere upstream
  // cannot reach a component that might render it.
  return { results: page.results ?? [], next_page_token: page.next_page_token ?? '' };
}

/**
 * Reads the index's per-repository freshness.
 *
 * This throws on a refusal on purpose. An unreadable index and an empty index
 * are different facts: an empty `entries` list means nothing is indexed, and a
 * refusal means we could not ask. Collapsing them would let the second render
 * as the first (SPEC-0049 AC6).
 */
export async function searchIndexStatus(request: Request): Promise<IndexStatusPageView> {
  const response = await bffFetch(request, '/api/v1/search/status');
  if (!response.ok) {
    throw new Error('search unavailable');
  }
  const view = (await response.json()) as Partial<IndexStatusPageView>;
  return { entries: view.entries ?? [] };
}

// --- the repository list (T-0055, SPEC-0052 AC10) -------------------------
//
// PR-24: the repositories the caller may see, and only those, with a
// repository they may not see indistinguishable from one that does not exist.
//
// The request carries no scope, because the contract defines none — the
// listable set is derived by the backend from the caller's authorization at
// request time. The response carries no total for the same reason it carries
// none at every other layer: no field is capable of expressing how many
// repositories were withheld, so non-enumeration is a property of the shape
// rather than a discipline each layer re-decides.

export interface RepositorySummary {
  repository_id: string;
  name: string;
}

export interface RepositoryListView {
  repositories: RepositorySummary[];
  next_page_token: string;
}

/** Lists the repositories the caller may see. */
export async function listRepositories(request: Request, pageToken: string): Promise<RepositoryListView> {
  const params = new URLSearchParams();
  if (pageToken) params.set('page_token', pageToken);
  const query = params.toString();
  const response = await bffFetch(request, `/v1/repositories${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('repositories unavailable');
  }
  const view = (await response.json()) as Partial<RepositoryListView>;
  // Reshaped rather than passed through, so a total invented anywhere upstream
  // cannot reach a component that might render it.
  return { repositories: view.repositories ?? [], next_page_token: view.next_page_token ?? '' };
}

// --- history and blame (T-0058, SPEC-0053) --------------------------------
//
// The identity fields keep their git_ names from the contract through to here,
// which is the last layer before a human reads them. See src/lib/commits.ts
// for why that matters more than it looks.

import type { CommitIdentityView } from './commits.js';

export interface CommitView {
  commit_id: string;
  identity: CommitIdentityView;
  subject: string;
}

export interface HistoryView {
  commits: CommitView[];
  next_page_token: string;
}

export interface BlameRangeView {
  start_line: number;
  end_line: number;
  commit_id: string;
  identity: CommitIdentityView;
}

export interface BlameView {
  ranges: BlameRangeView[];
  /** True when the file outran the server's attribution cap. */
  capped: boolean;
}

/** Reads one ref's history, optionally narrowed to a path. */
export async function history(
  request: Request,
  repositoryID: string,
  revision: string,
  path = '',
  pageToken = '',
): Promise<HistoryView> {
  const params = new URLSearchParams({ revision });
  if (path) params.set('path', path);
  if (pageToken) params.set('page_token', pageToken);
  const response = await bffFetch(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/history?${params}`,
  );
  if (!response.ok) {
    throw new Error('history unavailable');
  }
  const view = (await response.json()) as Partial<HistoryView>;
  return { commits: view.commits ?? [], next_page_token: view.next_page_token ?? '' };
}

/** Attributes one file's lines at a revision. */
export async function blame(
  request: Request,
  repositoryID: string,
  revision: string,
  path: string,
): Promise<BlameView> {
  const params = new URLSearchParams({ revision, path });
  const response = await bffFetch(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/blame?${params}`,
  );
  if (!response.ok) {
    throw new Error('blame unavailable');
  }
  const view = (await response.json()) as Partial<BlameView>;
  // capped defaults to TRUE when the field is missing. An absent flag means we
  // do not know whether this attribution is whole, and the safe reading of "we
  // do not know" is the one that does not claim completeness.
  return { ranges: view.ranges ?? [], capped: view.capped ?? true };
}

// --- pipeline runs (T-0061, SPEC-0054) ------------------------------------
//
// No log field, and no link to one: ADR-0072 defers retaining job output, and
// check-contracts.sh check 13 keeps the wire free of a field for it.

export interface RunView {
  job_id: string;
  repository_id: string;
  ref: string;
  commit_sha: string;
  trigger: string;
  state: string;
  queued_at: string;
  started_at: string;
  finished_at: string;
  outcome_summary: string;
}

export interface RunListView {
  runs: RunView[];
  next_page_token: string;
}

/** Lists the pipeline runs the caller may see. */
export async function pipelineRuns(
  request: Request,
  repositoryID = '',
  pageToken = '',
): Promise<RunListView> {
  const params = new URLSearchParams();
  if (repositoryID) params.set('repository_id', repositoryID);
  if (pageToken) params.set('page_token', pageToken);
  const query = params.toString();
  const response = await bffFetch(request, `/api/v1/pipelines/runs${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('pipelines unavailable');
  }
  const view = (await response.json()) as Partial<RunListView>;
  return { runs: view.runs ?? [], next_page_token: view.next_page_token ?? '' };
}

// --- policy visibility (T-0063, SPEC-0055) --------------------------------
//
// Reads only. There is no write client here and no route to call: ADR-0073
// defers what a tenant-authored policy is, and check-contracts.sh check 14
// keeps the contract free of a verb for it.

export interface BundleStatusView {
  bundle_revision: string;
  loaded_at: string;
}

export interface DecisionRecordView {
  decision_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  allowed: boolean;
  policy_revision: string;
  input_digest: string;
  mode: string;
  decided_at: string;
}

/** Reads which policy bundle is in force. */
export async function policyBundle(request: Request): Promise<BundleStatusView> {
  const response = await bffFetch(request, '/api/v1/policy/bundle');
  if (!response.ok) {
    throw new Error('policy unavailable');
  }
  const view = (await response.json()) as Partial<BundleStatusView>;
  return { bundle_revision: view.bundle_revision ?? '', loaded_at: view.loaded_at ?? '' };
}

/** Reads one recorded decision. */
export async function policyDecision(request: Request, decisionID: string): Promise<DecisionRecordView> {
  if (!decisionID) throw new Error('policy unavailable');
  const response = await bffFetch(request, `/api/v1/policy/decisions/${encodeURIComponent(decisionID)}`);
  if (!response.ok) {
    throw new Error('policy unavailable');
  }
  return (await response.json()) as DecisionRecordView;
}

// --- releases (T-0066, SPEC-0056) -----------------------------------------
//
// No artifact field, and no client method that could fetch one: ADR-0075
// accepted tags and notes, and check 15 keeps the wire free of one.

export interface TagView {
  name: string;
  commit_id: string;
}

export interface TagListView {
  tags: TagView[];
  next_page_token: string;
}

export interface ReleaseView {
  tag: string;
  published_commit: string;
  notes: string;
  published_by: string;
  published_at: string;
  notes_updated_at: string;
}

export interface ReleaseListView {
  releases: ReleaseView[];
  next_page_token: string;
}

/** Lists a repository's tags with what each points at now. */
export async function repositoryTags(request: Request, repositoryID: string): Promise<TagListView> {
  const response = await bffFetch(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/tags`);
  if (!response.ok) {
    throw new Error('releases unavailable');
  }
  const view = (await response.json()) as Partial<TagListView>;
  return { tags: view.tags ?? [], next_page_token: view.next_page_token ?? '' };
}

/** Lists a repository's releases. */
export async function repositoryReleases(
  request: Request,
  repositoryID: string,
  pageToken = '',
): Promise<ReleaseListView> {
  const params = new URLSearchParams();
  if (pageToken) params.set('page_token', pageToken);
  const query = params.toString();
  const response = await bffFetch(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/releases${query ? `?${query}` : ''}`,
  );
  if (!response.ok) {
    throw new Error('releases unavailable');
  }
  const view = (await response.json()) as Partial<ReleaseListView>;
  return { releases: view.releases ?? [], next_page_token: view.next_page_token ?? '' };
}

/** Publishes a release against a tag. Form-encoded, as every write on this frontend is. */
export async function publishRelease(
  request: Request,
  repositoryID: string,
  tag: string,
  notes: string,
): Promise<ReleaseView> {
  if (!repositoryID || !tag) throw new Error('releases unavailable');
  return bffPostForm<ReleaseView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/releases`,
    { tag, notes: notes ?? '' },
    'releases unavailable',
  );
}

/** Corrects a release's notes. There is no parameter here that could move it. */
export async function updateReleaseNotes(
  request: Request,
  repositoryID: string,
  tag: string,
  notes: string,
): Promise<ReleaseView> {
  if (!repositoryID || !tag) throw new Error('releases unavailable');
  return bffPostForm<ReleaseView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/releases/${encodeURIComponent(tag)}/notes`,
    { notes: notes ?? '' },
    'releases unavailable',
  );
}

/**
 * One repository's settings (T-0070, SPEC-0057).
 *
 * `archived_at` is empty when the repository is not archived, and there is no
 * `archived` boolean beside it: the instant is the state, at every layer from
 * the column to this type, so the two cannot disagree.
 *
 * There is no visibility, member, role or protection field here, and that is
 * ADR-0076's decision rather than an omission. check-contracts' check 16 keeps
 * the wire free of one, and a test asserts this type carries none.
 */
export interface SettingsView {
  repository_id: string;
  name: string;
  description: string;
  archived_at: string;
  settings_updated_at: string;
  settings_updated_by: string;
}

/** Reads a repository's settings. */
export async function repositorySettings(request: Request, repositoryID: string): Promise<SettingsView> {
  const response = await bffFetch(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/settings`,
  );
  if (!response.ok) {
    throw new Error('repository settings unavailable');
  }
  const view = (await response.json()) as Partial<SettingsView>;
  return {
    repository_id: view.repository_id ?? repositoryID,
    name: view.name ?? '',
    description: view.description ?? '',
    archived_at: view.archived_at ?? '',
    settings_updated_at: view.settings_updated_at ?? '',
    settings_updated_by: view.settings_updated_by ?? '',
  };
}

/**
 * Writes a repository's name and description. Form-encoded, as every write on
 * this frontend is.
 *
 * Both fields travel every time: the contract has no way to say "leave this one
 * alone", so a form that omitted the description would clear it, and this
 * function does not hide that from its caller.
 */
export async function updateRepositorySettings(
  request: Request,
  repositoryID: string,
  name: string,
  description: string,
): Promise<SettingsView> {
  if (!repositoryID) throw new Error('repository settings unavailable');
  return bffPostForm<SettingsView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/settings`,
    { name, description: description ?? '' },
    'repository settings unavailable',
  );
}

/**
 * Sets or clears the archived label.
 *
 * It states the state wanted rather than a transition, so a resubmitted form
 * does not flip it — a person cannot tell a slow response from a lost one, and a
 * toggle would punish them for finding out.
 */
export async function setRepositoryArchived(
  request: Request,
  repositoryID: string,
  archived: boolean,
): Promise<SettingsView> {
  if (!repositoryID) throw new Error('repository settings unavailable');
  return bffPostForm<SettingsView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/settings/archive`,
    { archived: archived ? 'true' : 'false' },
    'repository settings unavailable',
  );
}

/**
 * One data plane as the control plane last heard it (T-0073, SPEC-0058).
 *
 * `last_seen_at` is empty for a plane that has never connected. The emptiness is
 * the state, and it is not the same as an old instant: a plane provisioned an hour
 * ago and never seen is not a plane that went quiet an hour ago.
 *
 * There is no member, user or activity field here. ADR-0077 answered its own
 * follow-up: `Last active` is presence telemetry about people, and this product
 * does not collect any.
 */
export interface PlaneView {
  data_plane_id: string;
  status: string;
  cloud: string;
  region: string;
  agent_version: string;
  k8s_version: string;
  last_seen_at: string;
  enrolled_at: string;
  certificate_expires_at: string;
  token_id: string;
}

export interface FleetView {
  planes: PlaneView[];
}

/**
 * Reads the tenant's fleet report.
 *
 * A refusal here covers the door not being configured at all, and the caller must
 * keep the two readings apart: an unavailable report says nothing was asked, while
 * a successful empty one says this tenant has no data planes.
 */
export async function adminFleet(request: Request): Promise<FleetView> {
  const response = await bffFetch(request, '/v1/admin/fleet');
  if (!response.ok) {
    throw new Error('fleet report unavailable');
  }
  const view = (await response.json()) as Partial<FleetView>;
  return { planes: view.planes ?? [] };
}

/**
 * References an issue that lives in the customer's tracker (SPEC-0059).
 *
 * Form-encoded, as every write on this frontend is. The URL travels as the reader
 * typed it: the backend's domain decides what may be stored, and a second opinion
 * here would be a second place the rule lives.
 */
export async function linkExternalIssue(
  request: Request,
  repositoryID: string,
  mergeRequestID: string,
  tracker: string,
  issueKey: string,
  issueURL: string,
): Promise<MergeRequestView> {
  if (!repositoryID || !mergeRequestID) throw new Error('merge request unavailable');
  return bffPostForm<MergeRequestView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}/external_issues`,
    { tracker, issue_key: issueKey, url: issueURL },
    'merge request unavailable',
  );
}

/** Removes a reference by tracker and key — its identity, never a position. */
export async function unlinkExternalIssue(
  request: Request,
  repositoryID: string,
  mergeRequestID: string,
  tracker: string,
  issueKey: string,
): Promise<MergeRequestView> {
  if (!repositoryID || !mergeRequestID) throw new Error('merge request unavailable');
  return bffPostForm<MergeRequestView>(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}/external_issues/unlink`,
    { tracker, issue_key: issueKey },
    'merge request unavailable',
  );
}
