// A stand-in for the BFF, for the browse → file → diff end-to-end run
// (SPEC-0021 AC6, AC4) and for the CVD capture run (T-0048, SPEC-0047 AC10).
// It answers the SPEC-0021 read endpoints plus the two dashboards the capture
// run needs, and nothing else, so a request the SSR layer invents shows up as
// a 404 in the test rather than passing silently.
//
// The capture fixtures below are deliberately state-DENSE: every severity,
// every envelope state, a telemetry gap and a deferred dimension appear at
// once. A grayscale review is only as good as the states on the screen, and a
// fixture showing one happy row would prove nothing.
//
// It is deliberately dumb: no policy, no tenancy, no streaming subtleties. The
// contract under test here is the browser's path through the SSR routes, not
// the BFF's own behaviour — that has its own suite in bff/internal/browser.
import { createServer } from 'node:http';

const port = Number(process.env.STUB_BFF_PORT ?? 4321);

// The session cookie the SSR layer forwards. A request arriving without it is
// refused the same coarse way the real BFF refuses one (SPEC-0001), which is
// what lets the E2E assert that identity travels in the cookie and nowhere else.
const sessionCookie = '__Host-gitfrok_session';

const treeView = {
  entries: [
    { path: 'src', kind: 2, sizeBytes: '0' },
    { path: 'README.md', kind: 1, sizeBytes: '31' },
  ],
  nextPageToken: '',
};

const fileBody = '# gitfrok\n\nBrowsed through the BFF.\n';

// The patch carries BOTH a removed and an added line on purpose: the CVD
// capture run reviews the diff in grayscale, and a fixture with no deletion
// would leave the '−' marker — half of ADR-0069 decision 4 — unreviewed.
const patch = `diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,3 @@
 # gitfrok
-Browsed the old way.
+Browsed through the BFF.
`;

// --- capture fixtures (SPEC-0047 AC10) ----------------------------------

// Every severity and both lifecycles, so the grayscale pass sees the whole
// ramp side by side rather than one badge at a time.
const securityFindings = {
  findings: [
    { finding_id: 'f-1', repository_id: 'gateway-api', scanner_class: 'SAST', tool_name: 'semgrep', tool_version: '1.0', rule_id: 'sql-injection', severity: 'CRITICAL', lifecycle: 'OPEN', artifact_path: 'src/db/query.go', enclosing_content: '', component: '', component_version: '', first_seen_scan_id: 's1', last_seen_scan_id: 's4' },
    { finding_id: 'f-2', repository_id: 'gateway-api', scanner_class: 'DEPENDENCY', tool_name: 'osv', tool_version: '1.0', rule_id: 'CVE-2026-1111', severity: 'HIGH', lifecycle: 'OPEN', artifact_path: 'go.mod', enclosing_content: '', component: 'golang.org/x/net', component_version: 'v0.1.0', first_seen_scan_id: 's2', last_seen_scan_id: 's4' },
    { finding_id: 'f-3', repository_id: 'gateway-api', scanner_class: 'SECRETS', tool_name: 'gitleaks', tool_version: '1.0', rule_id: 'aws-key', severity: 'MEDIUM', lifecycle: 'OPEN', artifact_path: 'deploy/env', enclosing_content: '', component: '', component_version: '', first_seen_scan_id: 's3', last_seen_scan_id: 's4' },
    { finding_id: 'f-4', repository_id: 'gateway-api', scanner_class: 'CONTAINER', tool_name: 'trivy', tool_version: '1.0', rule_id: 'base-image-age', severity: 'LOW', lifecycle: 'RESOLVED', artifact_path: 'Dockerfile', enclosing_content: '', component: '', component_version: '', first_seen_scan_id: 's1', last_seen_scan_id: 's4' },
  ],
  next_page_token: '',
};

const securitySummary = {
  total_count: 4,
  facets: [
    { dimension: 'severity', values: [
      { value: 'CRITICAL', count: 1 }, { value: 'HIGH', count: 1 },
      { value: 'MEDIUM', count: 1 }, { value: 'LOW', count: 1 },
    ] },
    { dimension: 'scanner_class', values: [
      { value: 'SAST', count: 1 }, { value: 'DEPENDENCY', count: 1 },
      { value: 'SECRETS', count: 1 }, { value: 'CONTAINER', count: 1 },
    ] },
  ],
};

// One row per state the view can render: within, near, exceeded, a telemetry
// gap, and a deferred dimension. Trend covers all three directions.
const usageViewFixture = {
  dimensions: [
    { dimension: 'REPOSITORY_STORAGE', coverage: 'METERED', state: 'WITHIN', trend: 'FLAT', value: 12, envelope: 100, notification: 80, unit: 'GB', window_start: '2026-08-01T00:00:00Z', window_end: '2026-08-17T00:00:00Z', gaps: [] },
    { dimension: 'CI_MINUTES', coverage: 'METERED', state: 'NEAR', trend: 'RISING', value: 830, envelope: 1000, notification: 800, unit: 'minutes', window_start: '2026-08-01T00:00:00Z', window_end: '2026-08-17T00:00:00Z', gaps: [] },
    { dimension: 'EGRESS', coverage: 'METERED', state: 'EXCEEDED', trend: 'RISING', value: 1400, envelope: 1000, notification: 800, unit: 'GB', window_start: '2026-08-01T00:00:00Z', window_end: '2026-08-17T00:00:00Z', gaps: [] },
    { dimension: 'SCAN_VOLUME', coverage: 'METERED', trend: 'FALLING', telemetry_gap: true, unit: 'requests', gaps: [{ window_start: '2026-08-16T00:00:00Z', window_end: '2026-08-17T00:00:00Z', reason: 'no telemetry received' }] },
    { dimension: 'SEATS', coverage: 'DEFERRED', deferred_reason: 'No measurement in this phase', gaps: [] },
  ],
  divergences: [
    { dimension: 'CI_MINUTES', data_plane_id: 'plane-1', control_plane_value: 830, data_plane_reported_value: 640, window_start: '2026-08-16T00:00:00Z', window_end: '2026-08-17T00:00:00Z' },
  ],
  throttle: {
    desired_generation: 7, desired_max_ci_concurrency: 2, desired_queue_depth_cap: 50,
    has_applied_ack: true, applied_generation: 7, applied: true, acked_at: '2026-08-17T01:00:00Z',
  },
  generated_at: '2026-08-17T02:00:00Z',
};

// --- merge-request state (T-0049, SPEC-0048 AC11) ------------------------
//
// A mutable version counter, because the whole point of AC5 is that the UI can
// tell "your write was refused" apart from "the merge request moved under you".
// One fixture MR refuses every write while its version advances anyway, which
// is the only way to drive the staleness branch end to end.
// Repository settings as the stub keeps them (SPEC-0057). Mutable on purpose: a
// journey that writes and re-reads must see what it wrote.
const repositorySettings = {};

const mergeRequests = {
  'mr-1': {
    merge_request_id: 'mr-1', repository_id: 'repo-1',
    source_ref: 'feature', target_ref: 'main',
    title: 'Add the thing', description: 'it does the thing',
    creator_id: 'dev@gitsaas.test', state: 'OPEN',
    head_revision: 'abcdef1234567890', version: 1,
    created_at: '2026-08-18T00:00:00Z',
  },
  // Every write here is refused. Its version advances on each refusal so the
  // re-read reports a NEWER version — the stale branch.
  'mr-stale': {
    merge_request_id: 'mr-stale', repository_id: 'repo-1',
    source_ref: 'feature-2', target_ref: 'main',
    title: 'Moves under you', description: '',
    creator_id: 'dev@gitsaas.test', state: 'OPEN',
    head_revision: 'beefcafe12345678', version: 4,
    created_at: '2026-08-18T00:00:00Z',
  },
  // The capture fixture. No test writes to it, so the captures do not drift
  // with test order — mr-1 is merged by the write journey, and a capture that
  // shows MERGED on one run and OPEN on another is not a reviewable artifact.
  'mr-capture': {
    merge_request_id: 'mr-capture', repository_id: 'repo-1',
    source_ref: 'feature', target_ref: 'main',
    title: 'Add the thing', description: 'it does the thing',
    creator_id: 'dev@gitsaas.test', state: 'OPEN',
    head_revision: 'abcdef1234567890', version: 1,
    created_at: '2026-08-18T00:00:00Z',
    // Two references for the capture (SPEC-0059): one whose address is https and
    // renders as a link, and one stored with plain http, which must render as text.
    // The second is a state the frontend should never be handed — the backend
    // refuses it — which is exactly why the capture carries it: the fallback is only
    // reviewable if it is rendered.
    external_issues: [
      {
        tracker: 'JIRA', issue_key: 'PLAT-1421',
        url: 'https://tracker.example.test/browse/PLAT-1421',
        linked_by: 'dev@gitsaas.test', linked_at: '2026-08-19T09:00:00Z',
      },
      {
        tracker: 'Legacy', issue_key: 'OLD-7',
        url: 'http://tracker.example.test/OLD-7',
        linked_by: 'dev@gitsaas.test', linked_at: '2026-08-19T09:05:00Z',
      },
    ],
  },
  // The external-issue journeys write here rather than to mr-1 (SPEC-0059). Its own
  // fixture because every link bumps the version, and mr-actions submits against a
  // version it read — one spec's writes must not decide whether another spec passes.
  'mr-issues': {
    merge_request_id: 'mr-issues', repository_id: 'repo-1',
    source_ref: 'feature-4', target_ref: 'main',
    title: 'References an issue', description: '',
    creator_id: 'dev@gitsaas.test', state: 'OPEN',
    head_revision: 'facefeed12345678', version: 1,
    created_at: '2026-08-18T00:00:00Z',
  },
  // Refuses every write and never moves — the not-applied branch.
  'mr-refuses': {
    merge_request_id: 'mr-refuses', repository_id: 'repo-1',
    source_ref: 'feature-3', target_ref: 'main',
    title: 'Refuses quietly', description: '',
    creator_id: 'dev@gitsaas.test', state: 'OPEN',
    head_revision: 'facefeed12345678', version: 2,
    created_at: '2026-08-18T00:00:00Z',
  },
};

const DISPOSITION_ENUM = [
  'REVIEW_DISPOSITION_APPROVE',
  'REVIEW_DISPOSITION_REQUEST_CHANGES',
  'REVIEW_DISPOSITION_COMMENT',
];

/** Reads a form-encoded body, exactly as the BFF's r.ParseForm() would. */
function readForm(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(new URLSearchParams(body)));
  });
}

// --- compliance fixtures (T-0051 SPEC-0050, T-0052 SPEC-0051) ------------
//
// Three packs, because the three facts the surface must tell apart cannot be
// driven from one: a pack that streams whole, a pack whose stream stops
// without the final marker (the 200-with-truncation case), and a pack with a
// degraded section. All are write-free — nothing in the e2e journeys mutates
// them, so the captures do not drift with test order.
const packs = {
  'pack-ready': {
    state: 'READY',
    sections: [
      { type: 'APPROVALS', record_count: 12, gaps: [] },
      { type: 'POLICY_DECISIONS', record_count: 4, gaps: [] },
      { type: 'SCAN_GATES', record_count: 7, gaps: [] },
      { type: 'ACCESS_CHANGES', record_count: 2, gaps: [] },
    ],
    appendix_record_count: 0,
    range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z',
  },
  'pack-truncated': {
    state: 'READY',
    sections: [{ type: 'APPROVALS', record_count: 12, gaps: [] }],
    appendix_record_count: 0,
    range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z',
  },
  'pack-degraded': {
    state: 'READY',
    sections: [{
      type: 'ACCESS_CHANGES', record_count: 2,
      gaps: [{ from: '2026-07-05T00:00:00Z', to: '2026-07-06T00:00:00Z', reason: 'RETENTION' }],
    }],
    appendix_record_count: 0,
    range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z',
  },
  'pack-assembling': {
    state: 'ASSEMBLING',
    sections: [{ type: 'APPROVALS', record_count: 0, gaps: [] }],
    appendix_record_count: 0,
    range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z',
  },
  'pack-failed': {
    state: 'FAILED',
    failure_reason: 'the audit chain was unreadable for part of the range',
    sections: [],
    appendix_record_count: 0,
    range_from: '2026-07-01T00:00:00Z',
    range_to: '2026-08-01T00:00:00Z',
  },
};

const anchors = { first_seq: 1, last_seq: 12, first_record_hash: 'h1', last_record_hash: 'h12', prev_record_hash: 'h0' };

const packStreams = {
  // All four control sections, matching this pack's status exactly. They were
  // two until the AC11 review: a capture whose status table listed four
  // sections above a stream that delivered two depicts a state no real backend
  // produces, and a reviewer who learns to ignore that mismatch is a reviewer
  // who would ignore a real one.
  'pack-ready': [
    { header: { pack_id: 'pack-ready', range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z' } },
    { section: { type: 'APPROVALS', complete: true, gaps: [], records: [], records_digest: 'sha256:aaa', anchors } },
    { section: { type: 'POLICY_DECISIONS', complete: true, gaps: [], records: [], records_digest: 'sha256:bbb', anchors } },
    { section: { type: 'SCAN_GATES', complete: true, gaps: [], records: [], records_digest: 'sha256:eee', anchors } },
    { section: { type: 'ACCESS_CHANGES', complete: true, gaps: [], records: [], records_digest: 'sha256:fff', anchors } },
  ],
  // No final marker is ever written for this one. The response is still 200,
  // which is exactly the shape the real handler produces when assembly fails
  // after the first chunk.
  'pack-truncated': [
    { header: { pack_id: 'pack-truncated', range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z' } },
    { section: { type: 'APPROVALS', complete: true, gaps: [], records: [], records_digest: 'sha256:ccc', anchors } },
  ],
  'pack-degraded': [
    { header: { pack_id: 'pack-degraded', range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z' } },
    {
      section: {
        type: 'ACCESS_CHANGES', complete: false,
        gaps: [{ from: '2026-07-05T00:00:00Z', to: '2026-07-06T00:00:00Z', reason: 'RETENTION' }],
        records: [], records_digest: 'sha256:ddd', anchors,
      },
    },
  ],
};

// Grants. The list carries a bounded-expiry grant and — the fixture AC4 needs —
// one whose expiry is long past while the server still calls it ACTIVE. A UI
// that computed state from the clock would render that one expired.
const grants = [
  {
    grant_id: 'grant-1', tenant_id: 'tenant-1', auditor_principal_id: 'auditor@example.test',
    range_from: '2026-07-01T00:00:00Z', range_to: '2026-08-01T00:00:00Z',
    pack_ids: ['pack-ready'], expires_at: '2026-09-01T00:00:00Z',
    granted_by: 'admin@gitsaas.test', issued_at: '2026-08-18T00:00:00Z', state: 'ACTIVE',
  },
  {
    grant_id: 'grant-past-active', tenant_id: 'tenant-1', auditor_principal_id: 'auditor@example.test',
    range_from: '2026-01-01T00:00:00Z', range_to: '2026-02-01T00:00:00Z',
    pack_ids: ['pack-ready'], expires_at: '2020-01-01T00:00:00Z',
    granted_by: 'admin@gitsaas.test', issued_at: '2019-12-01T00:00:00Z', state: 'ACTIVE',
  },
  {
    grant_id: 'grant-revoked', tenant_id: 'tenant-1', auditor_principal_id: 'other@example.test',
    range_from: '2026-06-01T00:00:00Z', range_to: '2026-07-01T00:00:00Z',
    pack_ids: ['pack-degraded'], expires_at: '2026-10-01T00:00:00Z',
    granted_by: 'admin@gitsaas.test', issued_at: '2026-06-02T00:00:00Z',
    revoked_at: '2026-06-20T00:00:00Z', state: 'REVOKED',
  },
  {
    grant_id: 'grant-expired', tenant_id: 'tenant-1', auditor_principal_id: 'past@example.test',
    range_from: '2026-05-01T00:00:00Z', range_to: '2026-06-01T00:00:00Z',
    pack_ids: ['pack-ready'], expires_at: '2026-06-15T00:00:00Z',
    granted_by: 'admin@gitsaas.test', issued_at: '2026-05-02T00:00:00Z', state: 'EXPIRED',
  },
];

// --- code search fixtures (T-0050, SPEC-0049 AC12) -----------------------
//
// The three empty states share one wire shape and mean different things, so
// each needs its own query text to drive it:
//
//   'nothing'      -> empty page, index populated  ("matched nothing, or you
//                     may not see what it matched" — indistinguishable)
//   'cold'         -> empty page, index EMPTY      ("nothing is indexed")
//   'statusbroken' -> empty page, status route 404 ("index state unknown")
//
// All are write-free, so the captures do not drift with test order.
const searchHits = [
  {
    repository_id: 'repo-1', revision: 'main', path: 'internal/db/query.go',
    line_start: 42, line_end: 44, matched_content: 'func BuildQuery(ctx context.Context) (string, error) {',
    metadata: { path: 'internal/db/query.go', object_id: 'blob0001abcd', mode: 33188, size_bytes: 4096 },
  },
  {
    repository_id: 'repo-1', revision: 'main', path: 'internal/db/query_test.go',
    line_start: 11, line_end: 12, matched_content: 'got, err := BuildQuery(ctx)',
    // No metadata on purpose: enrichment degrades to no metadata, never to
    // no result, and the capture should show both kinds side by side.
  },
];

const indexEntries = [
  { repository_id: 'repo-1', last_indexed_revision: 'abc1234', indexed_at: '2026-08-18T00:00:00Z', freshness_lag_ms: 1200 },
  { repository_id: 'repo-2', last_indexed_revision: 'def5678', indexed_at: '2026-08-18T00:00:00Z', freshness_lag_ms: 900 },
];

// One repository far behind, so the stale reading has a fixture. The page
// reports the WORST lag, which is what this pair exists to prove.
const staleIndexEntries = [
  ...indexEntries,
  { repository_id: 'repo-3', last_indexed_revision: '0000000', indexed_at: '2026-08-17T00:00:00Z', freshness_lag_ms: 3_600_000 },
];

/** Which index-status answer the last query asked for. Read-only per query text. */
function statusFor(query) {
  if (query === 'cold') return { entries: [] };
  if (query === 'statusbroken') return null;
  if (query === 'stale') return { entries: staleIndexEntries };
  return { entries: indexEntries };
}

let lastSearchQuery = '';

/** Reads a JSON body. */
function readJSON(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve(null); }
    });
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const cookies = request.headers.cookie ?? '';
  if (!cookies.includes(`${sessionCookie}=`)) {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end();
    return;
  }

  const json = (payload) => {
    response.writeHead(200, { 'cache-control': 'private, no-store', 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  };

  // --- policy visibility (SPEC-0055) ------------------------------------
  if (url.pathname === '/api/v1/policy/bundle') {
    return json({ bundle_revision: '0.10.0', loaded_at: '2026-08-19T09:00:00Z' });
  }
  const decisionMatch = url.pathname.match(/^\/api\/v1\/policy\/decisions\/([^/]+)$/);
  if (decisionMatch) {
    const id = decodeURIComponent(decisionMatch[1]);
    if (id === 'missing') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end('policy unavailable');
      return;
    }
    // A DENIED, dry-run decision: the two states most easily misread — a
    // denial as a failure, and a dry run as something that took effect.
    return json({
      decision_id: id, action: 'repo.read', resource_type: 'repository', resource_id: 'repo-1',
      allowed: id !== 'denied' ? true : false,
      policy_revision: '0.10.0', input_digest: 'sha256:abcdef',
      mode: id === 'dryrun' ? 'EVALUATION_MODE_DRY_RUN' : 'EVALUATION_MODE_ENFORCE',
      decided_at: '2026-08-19T09:30:00Z',
    });
  }

  // --- pipeline runs (SPEC-0054) ----------------------------------------
  //
  // Every job state at once, so a grayscale pass sees the whole column a
  // reader actually scans rather than one badge at a time. Write-free.
  if (url.pathname === '/api/v1/pipelines/runs') {
    if (url.searchParams.get('page_token') === 'refuse') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end('pipelines unavailable');
      return;
    }
    if (url.searchParams.get('page_token') === 'empty') {
      return json({ runs: [], next_page_token: '' });
    }
    const run = (id, state, finished) => ({
      job_id: id, repository_id: 'repo-1', ref: 'refs/heads/main',
      commit_sha: 'abcdef1234567890', trigger: 'JOB_TRIGGER_KIND_REF_UPDATED',
      state, queued_at: '2026-08-19T09:00:00Z', started_at: '2026-08-19T09:00:10Z',
      finished_at: finished, outcome_summary: '',
    });
    return json({
      runs: [
        run('job-1', 'JOB_STATE_SUCCEEDED', '2026-08-19T09:02:00Z'),
        run('job-2', 'JOB_STATE_FAILED', '2026-08-19T08:41:00Z'),
        run('job-3', 'JOB_STATE_RUNNING', ''),
        run('job-4', 'JOB_STATE_QUEUED', ''),
        run('job-5', 'JOB_STATE_CANCELLED', '2026-08-19T08:10:00Z'),
      ],
      next_page_token: '',
    });
  }

  // --- the repository list (SPEC-0052) ----------------------------------
  //
  // Three fixtures, because the list has three answers that must not be
  // confused: a populated list, an EMPTY one (which is a 200 and must never
  // read as "there are none"), and a refusal.
  if (url.pathname === '/v1/repositories') {
    if (url.searchParams.get('page_token') === 'refuse') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end('repositories unavailable');
      return;
    }
    if (url.searchParams.get('page_token') === 'empty') {
      return json({ repositories: [], next_page_token: '' });
    }
    return json({
      repositories: [
        { repository_id: 'repo-1', name: 'Gateway API' },
        { repository_id: 'repo-2', name: 'Billing' },
      ],
      next_page_token: '',
    });
  }

  // --- code search (SPEC-0049) ------------------------------------------
  if (url.pathname === '/api/v1/search/query' && request.method === 'POST') {
    return readJSON(request).then((body) => {
      if (!body || !body.query || !['SUBSTRING', 'REGEX', 'SYMBOL'].includes(body.mode)) {
        response.writeHead(404, { 'cache-control': 'private, no-store' });
        response.end();
        return;
      }
      lastSearchQuery = body.query;
      // Every one of these returns the SAME empty shape. That is the point.
      if (['nothing', 'cold', 'statusbroken'].includes(body.query)) {
        return json({ results: [], next_page_token: '' });
      }
      if (body.page_token) return json({ results: [searchHits[1]], next_page_token: '' });
      return json({ results: searchHits, next_page_token: 'page-2' });
    });
  }

  if (url.pathname === '/api/v1/search/status') {
    const status = statusFor(lastSearchQuery);
    if (!status) {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end();
      return;
    }
    return json(status);
  }

  // --- compliance surfaces (SPEC-0050, SPEC-0051) -----------------------
  const refuse = () => {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end();
  };

  if (url.pathname === '/api/v1/audit/evidence-packs' && request.method === 'POST') {
    return readJSON(request).then((body) => {
      if (!body || !body.range_from || !body.range_to) return refuse();
      return json({ pack_id: 'pack-ready', state: 'PENDING' });
    });
  }

  const packStatusMatch = url.pathname.match(/^\/api\/v1\/audit\/evidence-packs\/([^/]+)\/status$/);
  if (packStatusMatch) {
    const pack = packs[decodeURIComponent(packStatusMatch[1])];
    return pack ? json(pack) : refuse();
  }

  const packStreamMatch = url.pathname.match(/^\/api\/v1\/audit\/evidence-packs\/([^/]+)$/);
  if (packStreamMatch) {
    const id = decodeURIComponent(packStreamMatch[1]);
    const lines = packStreams[id];
    if (!lines) return refuse();
    response.writeHead(200, { 'cache-control': 'private, no-store', 'content-type': 'application/x-ndjson' });
    lines.forEach((line, index) => {
      // pack-truncated never gets a final marker: the stream simply stops,
      // and the status stays 200 because it was written on the first chunk.
      const final = id !== 'pack-truncated' && index === lines.length - 1;
      response.write(`${JSON.stringify({ chunk_index: index, final_chunk: final, ...line })}\n`);
    });
    response.end();
    return;
  }

  if (url.pathname === '/api/v1/audit/auditor-grants') {
    if (request.method === 'GET') {
      const filter = url.searchParams.get('auditor_principal_id');
      return json({ grants: filter ? grants.filter((g) => g.auditor_principal_id === filter) : grants });
    }
    if (request.method === 'POST') {
      return readJSON(request).then((body) => {
        if (!body || !body.auditor_principal_id || !body.pack_ids?.length || !body.expires_at) return refuse();
        // The server bounds the requested expiry. A UI that echoed the form's
        // value would show the date that was asked for, not the one granted.
        return json({
          grant_id: 'grant-new', tenant_id: 'tenant-1',
          auditor_principal_id: body.auditor_principal_id,
          range_from: body.range_from, range_to: body.range_to,
          repository_id: body.repository_id ?? '',
          pack_ids: body.pack_ids,
          expires_at: '2026-09-01T00:00:00Z',
          granted_by: 'admin@gitsaas.test', issued_at: '2026-08-18T00:00:00Z', state: 'ACTIVE',
        });
      });
    }
  }

  const revokeMatch = url.pathname.match(/^\/api\/v1\/audit\/auditor-grants\/([^/]+)$/);
  if (revokeMatch && request.method === 'DELETE') {
    const grant = grants.find((g) => g.grant_id === decodeURIComponent(revokeMatch[1]));
    if (!grant) return refuse();
    // Answered as revoked WITHOUT mutating the fixture, so the journeys and the
    // captures stay independent of run order. The consequence is deliberate and
    // worth knowing before you extend this: after a revoke journey the page
    // renders "Applied" above a grant-1 that is still ACTIVE, because the list
    // re-reads this unchanged fixture. Asserting post-revoke state here would
    // need a mutating fixture, and that would put capture output back at the
    // mercy of test order — which is the trade this comment records.
    return json({ ...grant, state: 'REVOKED', revoked_at: '2026-08-18T12:00:00Z' });
  }

  // The capture surfaces (SPEC-0047 AC10).
  if (url.pathname === '/api/v1/usage/view') return json(usageViewFixture);
  if (url.pathname === '/api/v1/security/dashboard') return json(securityFindings);
  if (url.pathname === '/api/v1/security/findings/summary') return json(securitySummary);

  const deny = () => {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end('merge request unavailable');
  };

  // --- merge-request surface (SPEC-0048) --------------------------------
  // --- external issue references (SPEC-0059) ----------------------------
  //
  // Two fixtures the render cannot produce on its own: a reference stored with a
  // plain-http address, which must render as text rather than as a link, and a
  // tracker that refuses. The stub honours the state asked for and never validates
  // the URL — the real BFF's backend does that, and the point of the http fixture is
  // to prove the frontend refuses even when something upstream did not.
  const issueMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/merge_requests\/([^/]+)\/external_issues(?:\/(unlink))?$/);
  if (issueMatch && request.method === 'POST') {
    const [, , mergeRequestID, unlink] = issueMatch;
    const mr = mergeRequests[mergeRequestID];
    if (!mr) return deny();
    return readForm(request).then((form) => {
      const tracker = (form.get('tracker') ?? '').trim();
      const issueKey = (form.get('issue_key') ?? '').trim();
      mr.external_issues = mr.external_issues ?? [];
      if (unlink) {
        mr.external_issues = mr.external_issues.filter(
          (reference) => !(reference.tracker.toLowerCase() === tracker.toLowerCase() && reference.issue_key === issueKey),
        );
        mr.version += 1;
        return json(mr);
      }
      const issueURL = (form.get('url') ?? '').trim();
      if (!tracker || !issueKey || !issueURL.startsWith('https://')) {
        response.writeHead(400, { 'cache-control': 'private, no-store' });
        response.end('a reference needs a tracker, an issue key and an https URL');
        return;
      }
      if (mr.external_issues.length >= 25) {
        response.writeHead(409, { 'cache-control': 'private, no-store' });
        response.end('this merge request has as many issue references as it can carry');
        return;
      }
      if (!mr.external_issues.some((r) => r.tracker.toLowerCase() === tracker.toLowerCase() && r.issue_key === issueKey)) {
        mr.external_issues.push({
          tracker, issue_key: issueKey, url: issueURL,
          linked_by: 'dev@gitsaas.test', linked_at: '2026-08-19T09:00:00Z',
        });
        mr.version += 1;
      }
      return json(mr);
    });
  }

  const mrMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/merge_requests(?:\/([^/]+))?(?:\/(review|merge))?$/);
  if (mrMatch) {
    const [, , mergeRequestID, action] = mrMatch;

    if (request.method === 'GET' && mergeRequestID && !action) {
      const mr = mergeRequests[mergeRequestID];
      return mr ? json(mr) : deny();
    }

    if (request.method === 'POST' && !mergeRequestID) {
      // Open. A JSON body reaches ParseForm as no fields, so it is refused
      // here the same way the real handler would refuse it.
      return readForm(request).then((form) => {
        if (!form.get('source_ref') || !form.get('target_ref') || !form.get('title')) return deny();
        const created = {
          ...mergeRequests['mr-1'],
          merge_request_id: 'mr-new',
          source_ref: form.get('source_ref'),
          target_ref: form.get('target_ref'),
          title: form.get('title'),
          description: form.get('description') ?? '',
          version: 1,
        };
        mergeRequests['mr-new'] = created;
        return json(created);
      });
    }

    if (request.method === 'POST' && mergeRequestID && action) {
      const mr = mergeRequests[mergeRequestID];
      if (!mr) return deny();
      return readForm(request).then((form) => {
        const expected = Number.parseInt(form.get('expected_version') ?? '', 10);

        if (mergeRequestID === 'mr-stale') {
          // Refuse, but move — the re-read must report a newer version.
          mr.version += 1;
          return deny();
        }
        if (mergeRequestID === 'mr-refuses') return deny();

        if (!Number.isInteger(expected) || expected !== mr.version) return deny();
        if (action === 'review') {
          // The enum-name trap: a bare "APPROVE" would be UNSPECIFIED at the
          // real BFF and refused, so it is refused here too.
          if (!DISPOSITION_ENUM.includes(form.get('disposition') ?? '')) return deny();
          if (!form.get('head_revision')) return deny();
          mr.version += 1;
          return json(mr);
        }
        mr.state = 'MERGED';
        mr.version += 1;
        return json(mr);
      });
    }

    return deny();
  }

  // --- releases and tags (SPEC-0056) ------------------------------------
  //
  // The fixtures exist to drive the three tag agreements at once: v1.0.0 still
  // points where it did, v0.9.0 has been moved, and v0.8.0's tag is gone. All
  // write-free.
  const releaseMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/(tags|releases)$/);
  if (releaseMatch) {
    const [, releaseRepo, kind] = releaseMatch;
    if (!releaseRepo || releaseRepo === 'unknown-repo') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end('releases unavailable');
      return;
    }
    if (kind === 'tags') {
      return json({
        tags: [
          { name: 'v1.0.0', commit_id: 'aaaaaaa1111111111111' },
          // Moved: the release recorded bbbbbbb, the tag now names cccccccc.
          { name: 'v0.9.0', commit_id: 'ccccccc3333333333333' },
          // v0.8.0 is absent on purpose — its release records a tag that is gone.
          { name: 'v1.1.0', commit_id: 'ddddddd4444444444444' },
        ],
        next_page_token: '',
      });
    }
    if (request.method === 'POST') {
      return readForm(request).then((form) => {
        const tag = form.get('tag');
        if (!tag) return refuseReleases();
        if (tag === 'v1.0.0') {
          response.writeHead(409, { 'cache-control': 'private, no-store' });
          response.end('this tag already has a release');
          return;
        }
        return json({
          tag, published_commit: 'ddddddd4444444444444', notes: form.get('notes') ?? '',
          published_by: 'dev@gitsaas.test', published_at: '2026-08-19T12:00:00Z',
          notes_updated_at: '',
        });
      });
    }
    return json({
      releases: [
        {
          tag: 'v1.0.0', published_commit: 'aaaaaaa1111111111111',
          notes: 'The first one. Everything works.',
          published_by: 'dev@gitsaas.test', published_at: '2026-08-19T09:00:00Z',
          notes_updated_at: '',
        },
        {
          tag: 'v0.9.0', published_commit: 'bbbbbbb2222222222222',
          notes: 'Release candidate.',
          published_by: 'dev@gitsaas.test', published_at: '2026-08-18T09:00:00Z',
          notes_updated_at: '2026-08-18T15:00:00Z',
        },
        {
          tag: 'v0.8.0', published_commit: 'eeeeeee5555555555555',
          notes: 'Older, and its tag has since been deleted.',
          published_by: 'dev@gitsaas.test', published_at: '2026-08-17T09:00:00Z',
          notes_updated_at: '',
        },
      ],
      next_page_token: '',
    });
  }
  const notesMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/releases\/([^/]+)\/notes$/);
  if (notesMatch && request.method === 'POST') {
    return readForm(request).then((form) => json({
      tag: decodeURIComponent(notesMatch[2]), published_commit: 'aaaaaaa1111111111111',
      notes: form.get('notes') ?? '', published_by: 'dev@gitsaas.test',
      published_at: '2026-08-19T09:00:00Z', notes_updated_at: '2026-08-20T10:00:00Z',
    }));
  }

  function refuseReleases() {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end('releases unavailable');
  }

  // --- the admin area's fleet report (SPEC-0058) -------------------------
  //
  // Three fixtures, because the panel's claim is about age and state: a plane that
  // reported minutes ago, one that has not reported in days, and one provisioned
  // that never connected at all. The stale row is the one an operator is scanning
  // for, so it is not the first row.
  if (url.pathname === '/v1/admin/fleet') {
    // The unavailable reading is driven by the session, not by a query parameter:
    // the page is rendered server-side, so the browser never builds this URL and
    // could not add one. A session named for it is the only handle a browser test
    // has on what the BFF answers.
    if ((request.headers.cookie ?? '').includes('e2e-session-nofleet')) {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end('fleet report unavailable');
      return;
    }
    return json({
      planes: [
        {
          data_plane_id: 'dp-eu-1', status: 'CONNECTED', cloud: 'CLOUD_GKE', region: 'eu-west-1',
          agent_version: '1.4.0', k8s_version: '1.30',
          last_seen_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
          enrolled_at: '2026-08-16T09:00:00Z', certificate_expires_at: '2026-08-20T09:00:00Z',
          token_id: '',
        },
        {
          data_plane_id: 'dp-us-1', status: 'STALE', cloud: 'CLOUD_EKS', region: 'us-east-1',
          agent_version: '1.3.2', k8s_version: '1.29',
          last_seen_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          enrolled_at: '2026-07-30T09:00:00Z', certificate_expires_at: '2026-08-19T09:00:00Z',
          token_id: '',
        },
        {
          data_plane_id: '', status: 'NEVER_CONNECTED', cloud: '', region: '',
          agent_version: '', k8s_version: '', last_seen_at: '', enrolled_at: '',
          certificate_expires_at: '', token_id: 'tok-provisioned-9',
        },
      ],
    });
  }

  // --- repository settings (SPEC-0057) ----------------------------------
  //
  // Two fixtures, because the surface's whole claim is about the archived label:
  // repo-1 is active and archived-repo carries the label. Neither differs in any
  // other way, which is the point — archival changes nothing else.
  const settingsMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/settings$/);
  if (settingsMatch) {
    const [, settingsRepo] = settingsMatch;
    if (!settingsRepo || settingsRepo === 'unknown-repo') {
      return refuseSettings();
    }
    if (request.method === 'POST') {
      return readForm(request).then((form) => {
        const name = form.get('name');
        if (!name) {
          response.writeHead(400, { 'cache-control': 'private, no-store' });
          response.end('a repository needs a name');
          return;
        }
        return json(settingsFixture(settingsRepo, {
          name,
          description: form.get('description') ?? '',
        }));
      });
    }
    return json(settingsFixture(settingsRepo, {}));
  }
  const archiveMatch = url.pathname.match(/^\/v1\/repositories\/([^/]+)\/settings\/archive$/);
  if (archiveMatch && request.method === 'POST') {
    return readForm(request).then((form) => json(settingsFixture(archiveMatch[1], {
      // The stub honours the state asked for rather than toggling, exactly as the
      // backend does: a resubmitted form asks for the same state again.
      archived_at: form.get('archived') === 'true' ? '2026-08-19T12:00:00Z' : '',
    })));
  }

  // The stub KEEPS what was written, so a journey can prove the write took effect
  // rather than only that the redirect happened. A fixture that forgets makes the
  // re-read assert the seed, which is the same value a refused write would show.
  function settingsFixture(repositoryID, overrides) {
    const stored = repositorySettings[repositoryID] ?? {
      repository_id: repositoryID,
      name: repositoryID === 'archived-repo' ? 'retired-service' : 'infra',
      description: 'Cluster bootstrap and the runbooks that go with it.',
      archived_at: repositoryID === 'archived-repo' ? '2026-08-18T11:00:00Z' : '',
      settings_updated_at: '2026-08-19T09:30:00Z',
      settings_updated_by: 'owner@gitsaas.test',
    };
    repositorySettings[repositoryID] = { ...stored, ...overrides };
    return repositorySettings[repositoryID];
  }

  function refuseSettings() {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end('repository settings unavailable');
  }

  // --- history and blame (SPEC-0053) ------------------------------------
  //
  // The blame fixture for 'capped.go' returns capped:true so the partial
  // notice has a journey. Write-free, like every other capture fixture.
  const gitIdentity = {
    git_author_name: 'Ada Lovelace', git_author_email: 'ada@example.test',
    git_committer_name: 'Grace Hopper', git_committer_email: 'grace@example.test',
    authored_at: '2026-08-19T09:00:00Z', committed_at: '2026-08-19T10:00:00Z',
  };

  const [, , , historyRepo, historyView] = url.pathname.split('/');
  if (historyView === 'history') {
    if (!historyRepo || historyRepo === 'unknown-repo') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end();
      return;
    }
    return json({
      commits: [
        { commit_id: 'abcdef1234567890', identity: gitIdentity, subject: 'Add the thing' },
        { commit_id: '1234567890abcdef', identity: gitIdentity, subject: 'Fix the other thing' },
      ],
      next_page_token: '',
    });
  }
  if (historyView === 'blame') {
    if (!historyRepo || historyRepo === 'unknown-repo') {
      response.writeHead(404, { 'cache-control': 'private, no-store' });
      response.end();
      return;
    }
    const capped = url.searchParams.get('path') === 'capped.go';
    return json({
      ranges: [
        { start_line: 1, end_line: 12, commit_id: 'abcdef1234567890', identity: gitIdentity },
        { start_line: 13, end_line: 13, commit_id: '1234567890abcdef', identity: gitIdentity },
      ],
      capped,
    });
  }

  const [, , , repositoryID, view] = url.pathname.split('/');
  if (!repositoryID || repositoryID === 'unknown-repo') {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end();
    return;
  }

  const headers = { 'cache-control': 'private, no-store' };
  switch (view) {
    case 'tree':
      response.writeHead(200, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify(treeView));
      return;
    case 'file':
      response.writeHead(200, {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-gitfrok-file-metadata': JSON.stringify({
          path: url.searchParams.get('path'),
          sizeBytes: String(fileBody.length),
        }),
      });
      response.end(fileBody);
      return;
    case 'diff':
      response.writeHead(200, { ...headers, 'content-type': 'text/plain' });
      response.end(patch);
      return;
    default:
      response.writeHead(404, headers);
      response.end();
  }
});

server.listen(port, () => {
  process.stdout.write(`stub bff listening on ${port}\n`);
});
