// BFF client — the only upstream the web frontend has (invariant 22, SPEC-0021).
//
// The webfrontend is server-rendered (ADR-0020); every data fetch here runs on
// the Astro server and talks to the BFF over HTTP. It never holds a backend
// address, a gRPC client, a storage client, or a credential: identity travels
// in the browser's session cookie, which the SSR fetch forwards unchanged.
import type { BrowserTreeEntry, TreeView, FileViewMetadata } from '../gen/proto/bff/v1/browser_pb.js';
import type { ImportedHistoryView } from './provenance.js';

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

/** Posts one form-encoded write to the BFF under the browser's session. */
async function bffPostForm(request: Request, path: string, fields: Record<string, string>): Promise<MergeRequestView> {
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
    throw new Error('merge request unavailable');
  }
  return (await response.json()) as MergeRequestView;
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
  return bffPostForm(request, `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests`, {
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
  return bffPostForm(
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
  return bffPostForm(
    request,
    `/v1/repositories/${encodeURIComponent(repositoryID)}/merge_requests/${encodeURIComponent(mergeRequestID)}/merge`,
    { expected_version: String(expectedVersion) },
  );
}
