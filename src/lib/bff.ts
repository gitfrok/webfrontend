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
