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

  // The capture surfaces (SPEC-0047 AC10).
  if (url.pathname === '/api/v1/usage/view') return json(usageViewFixture);
  if (url.pathname === '/api/v1/security/dashboard') return json(securityFindings);
  if (url.pathname === '/api/v1/security/findings/summary') return json(securitySummary);

  const deny = () => {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end('merge request unavailable');
  };

  // --- merge-request surface (SPEC-0048) --------------------------------
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
