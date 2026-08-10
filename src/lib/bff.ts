// BFF client — the only upstream the web frontend has (invariant 22, SPEC-0021).
//
// The webfrontend is server-rendered (ADR-0020); every data fetch here runs on
// the Astro server and talks to the BFF over HTTP. It never holds a backend
// address, a gRPC client, a storage client, or a credential: identity travels
// in the browser's session cookie, which the SSR fetch forwards unchanged.
import type { BrowserTreeEntry, TreeView, FileViewMetadata } from '../gen/proto/bff/v1/browser_pb.js';

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
