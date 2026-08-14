import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import reactRenderer from '@astrojs/react/server.js';
import SecurityFindings from '../src/components/SecurityFindings.astro';
import type { SecurityFindingView, SecurityFilters, SecuritySummary } from '../src/lib/bff';

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

function summary(): SecuritySummary {
  return {
    total_count: 2,
    facets: [
      { dimension: 'severity', values: [{ value: 'HIGH', count: 2 }] },
      { dimension: 'owning_team', values: [{ value: 'platform', count: 2 }] },
    ],
  };
}

async function render(props: {
  findings: SecurityFindingView[];
  summary: SecuritySummary;
  filters: SecurityFilters;
  nextPageToken: string;
}): Promise<string> {
  // The triage control is a React island; the container needs the React
  // server renderer (and a client renderer for client:load) to render it
  // the way the SSR server does.
  const container = await AstroContainer.create();
  container.addServerRenderer({ renderer: reactRenderer });
  container.addClientRenderer({ name: '@astrojs/react', entrypoint: '@astrojs/react/client.js' });
  return container.renderToString(SecurityFindings, { props });
}

// SPEC-0026 as the reader sees it: one consolidated view with the AC2
// filters, server-computed facets, and — critically — an empty result that
// reads the same whether nothing matched or nothing is readable (AC6).
describe('security findings rendering', () => {
  it('renders one consolidated row per finding with its severity and lifecycle', async () => {
    const html = await render({
      findings: [finding(), finding({ finding_id: 'finding-2', scanner_class: 'SECRETS', severity: 'CRITICAL' })],
      summary: summary(),
      filters: {},
      nextPageToken: '',
    });
    expect(html).toContain('go.sql-injection');
    expect(html).toContain('internal/db/query.go');
    expect(html).toContain('SAST');
    expect(html).toContain('SECRETS');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('OPEN');
  });

  it('renders the SPEC-0026 AC2 filter set as keyboard-reachable form controls', async () => {
    const html = await render({ findings: [], summary: { total_count: 0, facets: [] }, filters: {}, nextPageToken: '' });
    for (const name of ['repository', 'scanner_class', 'severity', 'lifecycle', 'min_age_days', 'max_age_days', 'owning_team']) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain('Apply filters');
  });

  it('renders facet counts as filter links and marks the active one', async () => {
    const html = await render({
      findings: [finding()],
      summary: summary(),
      filters: { severity: 'HIGH' },
      nextPageToken: '',
    });
    expect(html).toContain('HIGH');
    expect(html).toContain('(2)');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('severity=HIGH');
    expect(html).toContain('owning_team=platform');
  });

  it('renders the identical empty state without any permission statement', async () => {
    const html = await render({ findings: [], summary: { total_count: 0, facets: [] }, filters: {}, nextPageToken: '' });
    expect(html).toContain('No findings to show.');
    // No-match and not-readable are the same page: nothing in the markup may
    // distinguish them (SPEC-0026 AC6).
    expect(html.toLowerCase()).not.toContain('unauthorized');
    expect(html.toLowerCase()).not.toContain('forbidden');
    expect(html.toLowerCase()).not.toContain('permission');
    expect(html.toLowerCase()).not.toContain('denied');
    expect(html.toLowerCase()).not.toContain('access');
  });

  it('links the next cursor page with the active filters intact', async () => {
    const html = await render({
      findings: [finding()],
      summary: summary(),
      filters: { severity: 'HIGH' },
      nextPageToken: 'cursor-2',
    });
    expect(html).toContain('Next page');
    expect(html).toContain('severity=HIGH');
    expect(html).toContain('page_token=cursor-2');
  });

  it('mounts the triage control on every finding', async () => {
    const html = await render({ findings: [finding()], summary: summary(), filters: {}, nextPageToken: '' });
    expect(html).toContain('astro-island');
    expect(html).toContain('Record a triage decision');
    expect(html).toContain('Accept');
    expect(html).toContain('False positive');
    expect(html).toContain('Defer');
  });
});
