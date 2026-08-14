import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import MRFindings from '../src/components/MRFindings.astro';
import MRDiffFindings from '../src/components/MRDiffFindings.astro';
import type { MRFindingView, AttributionSummary, SecurityFindingView, SecurityTriageView } from '../src/lib/bff';

// SPEC-0028 as the reviewer sees it: findings inline on the merge request that
// introduced them, triaged findings rendered in their triaged state (AC5), and
// a failed or missing scan rendered as UNAVAILABLE with its reason — never as
// "no findings" (AC7). Rendering is presentational only: attribution, triage
// and counts arrive from the backend and are shown verbatim.

function finding(overrides: Partial<SecurityFindingView> = {}): SecurityFindingView {
  return {
    finding_id: 'finding-1',
    repository_id: 'acme/web',
    scanner_class: 'SAST',
    tool_name: 'semgrep',
    tool_version: '1.2.3',
    rule_id: 'go.sql-injection',
    severity: 'HIGH',
    lifecycle: 'OPEN',
    artifact_path: 'internal/db/query.go',
    enclosing_content: 'func BuildQuery',
    component: '',
    component_version: '',
    first_seen_scan_id: 'scan-1',
    last_seen_scan_id: 'scan-2',
    ...overrides,
  };
}

function triage(overrides: Partial<SecurityTriageView> = {}): SecurityTriageView {
  return {
    triage_id: 'triage-1',
    finding_id: 'finding-1',
    repository_id: 'acme/web',
    state: 'ACCEPT',
    justification: 'risk owned',
    version: 1,
    actor_id: 'actor-a',
    occurred_at: '2026-08-14T00:00:00Z',
    ...overrides,
  };
}

function mrFinding(overrides: Partial<MRFindingView> = {}): MRFindingView {
  return {
    finding: finding(),
    head_location: {
      artifact_path: 'internal/db/query.go',
      enclosing_content: 'func BuildQuery',
      component: '',
      component_version: '',
    },
    attribution: 'ATTRIBUTED',
    ...overrides,
  };
}

function summary(overrides: Partial<AttributionSummary> = {}): AttributionSummary {
  return {
    status: 'ATTRIBUTED',
    head_revision: 'head-rev',
    merge_base_revision: 'base-rev',
    stale: false,
    attributed_low: 0,
    attributed_medium: 0,
    attributed_high: 1,
    attributed_critical: 0,
    ...overrides,
  };
}

const patch = [
  'diff --git a/internal/db/query.go b/internal/db/query.go',
  'index 1111111..2222222 100644',
  '--- a/internal/db/query.go',
  '+++ b/internal/db/query.go',
  '@@ -10,3 +10,4 @@',
  ' func BuildQuery() {',
  '+\tdb.Exec(userInput)',
  ' }',
  'diff --git a/web/index.html b/web/index.html',
  'index 3333333..4444444 100644',
  '--- a/web/index.html',
  '+++ b/web/index.html',
  '@@ -1,2 +1,3 @@',
  ' <html>',
  '+<script src="app.js">',
].join('\n');

async function renderSection(props: {
  findings: MRFindingView[];
  summary: AttributionSummary;
  diffHref: string;
  nextPageToken: string;
}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(MRFindings, { props });
}

async function renderDiff(props: {
  patch: string;
  findings: MRFindingView[];
  summary: AttributionSummary;
}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(MRDiffFindings, { props });
}

describe('merge request findings section', () => {
  it('renders a triaged-ACCEPT finding in its accepted state, not as new', async () => {
    const html = await renderSection({
      findings: [mrFinding({ triage: triage({ state: 'ACCEPT' }) })],
      summary: summary(),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html).toContain('Accepted');
    expect(html).toContain('risk owned');
    expect(html).not.toContain('Awaiting triage');
  });

  it('renders a triaged-FALSE_POSITIVE finding in its false-positive state, not as new', async () => {
    const html = await renderSection({
      findings: [mrFinding({ triage: triage({ state: 'FALSE_POSITIVE', justification: 'benign pattern' }) })],
      summary: summary(),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html).toContain('False positive');
    expect(html).toContain('benign pattern');
    expect(html).not.toContain('Awaiting triage');
  });

  it('renders an untriaged finding as awaiting triage with a link into the diff', async () => {
    const html = await renderSection({
      findings: [mrFinding()],
      summary: summary(),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html).toContain('Awaiting triage');
    expect(html).toContain('merge_request_id=mr-1');
    expect(html).toContain('#finding-finding-1');
  });

  it('renders a failed scan as UNAVAILABLE with its reason, never as no findings', async () => {
    const html = await renderSection({
      findings: [],
      summary: summary({ status: 'UNAVAILABLE', unavailable_reason: 'HEAD_SCAN_FAILED', attributed_high: 0 }),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html).toContain('UNAVAILABLE');
    expect(html).toContain('HEAD_SCAN_FAILED');
    expect(html.toLowerCase()).not.toContain('no findings');
  });

  it('says "no findings" only when the summary says attribution was computed', async () => {
    const html = await renderSection({
      findings: [],
      summary: summary({ attributed_high: 0 }),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html.toLowerCase()).toContain('no findings');
  });

  it('marks a stale attribution as stale and never as current', async () => {
    const html = await renderSection({
      findings: [mrFinding()],
      summary: summary({ stale: true }),
      diffHref: '/repos/acme/web/diff/head-rev?merge_request_id=mr-1',
      nextPageToken: '',
    });
    expect(html.toLowerCase()).toContain('stale');
  });

  it('says nothing about permissions in any state', async () => {
    for (const props of [
      { findings: [], summary: summary({ attributed_high: 0 }), diffHref: '/d', nextPageToken: '' },
      { findings: [], summary: summary({ status: 'UNAVAILABLE', unavailable_reason: 'BASE_NOT_SCANNED' }), diffHref: '/d', nextPageToken: '' },
    ]) {
      const html = await renderSection(props);
      for (const word of ['unauthorized', 'forbidden', 'permission', 'denied']) {
        expect(html.toLowerCase()).not.toContain(word);
      }
    }
  });
});

describe('merge request diff inline findings', () => {
  it('renders a finding inline at its file in the diff, anchored by its identity', async () => {
    const html = await renderDiff({ patch, findings: [mrFinding()], summary: summary() });
    const fileIndex = html.indexOf('internal/db/query.go');
    const anchorIndex = html.indexOf('id="finding-finding-1"');
    const nextFileIndex = html.indexOf('web/index.html');
    expect(fileIndex).toBeGreaterThan(-1);
    expect(anchorIndex).toBeGreaterThan(fileIndex);
    // The annotation sits inside its file's block, before the next file starts.
    expect(nextFileIndex === -1 || anchorIndex < nextFileIndex).toBe(true);
    expect(html).toContain('go.sql-injection');
  });

  it('keeps a finding reachable when its head path matches no diff file', async () => {
    const html = await renderDiff({
      patch,
      findings: [mrFinding({ head_location: { artifact_path: 'elsewhere/moved.go', enclosing_content: 'func Moved', component: '', component_version: '' } })],
      summary: summary(),
    });
    expect(html).toContain('id="finding-finding-1"');
    expect(html).toContain('elsewhere/moved.go');
  });

  it('renders a failed scan as UNAVAILABLE with its reason, never as no findings', async () => {
    const html = await renderDiff({
      patch,
      findings: [],
      summary: summary({ status: 'UNAVAILABLE', unavailable_reason: 'HEAD_SCAN_TIMED_OUT', attributed_high: 0 }),
    });
    expect(html).toContain('UNAVAILABLE');
    expect(html).toContain('HEAD_SCAN_TIMED_OUT');
    expect(html.toLowerCase()).not.toContain('no findings');
  });

  it('renders the triaged state inline exactly as the section does', async () => {
    const html = await renderDiff({
      patch,
      findings: [mrFinding({ triage: triage({ state: 'FALSE_POSITIVE' }) })],
      summary: summary(),
    });
    expect(html).toContain('False positive');
    expect(html).not.toContain('Awaiting triage');
  });

  it('renders the plain patch untouched when no merge request is attached', async () => {
    const html = await renderDiff({ patch, findings: [], summary: summary({ attributed_high: 0 }) });
    expect(html).toContain('db.Exec(userInput)');
    expect(html.toLowerCase()).toContain('no findings');
  });
});
