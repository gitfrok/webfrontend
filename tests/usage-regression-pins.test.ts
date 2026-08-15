// SPEC-0046 AC5's regression pins for the rendered surface (T-0043). These
// are the two promises that must NEVER regress, asserted against the
// component the customer actually sees:
//
//  1. NEVER-ZERO: an unmetered dimension (DEFERRED) and a telemetry gap
//     render "not metered" / a visible gap — never a zero (SPEC-0041 AC2,
//     AC3).
//  2. NEVER-BLOCKED-GIT: in EVERY envelope state, per dimension, the
//     rendered surface keeps the git-availability promise (SPEC-0041 AC7):
//     nothing the usage view describes blocks push/fetch/clone/reads.
//
// The file is wired into the build (package.json "prebuild"): a regression
// here fails `npm run build`, not just the test suite.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import UsageView from '../src/components/UsageView.astro';
import type { UsageDimensionView, UsageViewResponse } from '../src/lib/bff';

const generatedAt = '2026-08-15T12:00:00Z';
const windowBounds = { window_start: '2026-08-15T11:00:00Z', window_end: '2026-08-15T12:00:00Z' };

function row(overrides: Partial<UsageDimensionView> & Pick<UsageDimensionView, 'dimension' | 'coverage'>): UsageDimensionView {
  return { gaps: [], ...overrides };
}

async function render(view: UsageViewResponse): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(UsageView, { props: { view } });
}

function rowHtml(html: string, dimension: string): string {
  const start = html.indexOf(`data-dimension="${dimension}"`);
  expect(start, `rendered view must carry a row for ${dimension}`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</tr>', start));
}

describe('SPEC-0046 AC5 regression pins (build-blocking)', () => {
  // Pin 1 — never-zero: every unmetered shape renders as absence, never as
  // a number. A DEFERRED row and a gapped row carry no value field to
  // render, so any zero in their cells would be fabricated.
  it('PIN never-zero: unmetered dimensions and gaps render absence, never zero', async () => {
    const html = await render({
      dimensions: [
        row({ dimension: 'SEATS', coverage: 'DEFERRED', deferred_reason: 'identity events live on the data plane' }),
        row({ dimension: 'REPOSITORY_STORAGE', coverage: 'DEFERRED', deferred_reason: 'a size, not an event' }),
        row({ dimension: 'INDEX_SIZE', coverage: 'DEFERRED', deferred_reason: 'a size, not an event' }),
        row({ dimension: 'EGRESS', coverage: 'METERED', telemetry_gap: true, gaps: [{ ...windowBounds, reason: 'no telemetry received' }] }),
      ],
      divergences: [],
      generated_at: generatedAt,
    });
    for (const dimension of ['SEATS', 'REPOSITORY_STORAGE', 'INDEX_SIZE', 'EGRESS']) {
      const cells = rowHtml(html, dimension);
      expect(cells, `${dimension} must render no value cell`).not.toContain('data-usage-value');
      expect(cells, `${dimension} must render no zero`).not.toMatch(/>0[ .,]*/);
    }
    expect(html).toContain('Not metered yet');
    expect(html).toContain('No measurement in this phase');
    expect(html).toContain('Telemetry gap');
  });

  // Pin 2 — never-blocked-git, per dimension: for EVERY envelope state a
  // metered dimension can show, the rendered surface keeps the git promise
  // — enforcement prose speaks only of CI throttling, and the view's own
  // footer states git traffic is never blocked.
  it('PIN never-blocked-git: every envelope state per dimension keeps the git promise', async () => {
    const dimensions = ['CI_MINUTES', 'CI_CONCURRENCY', 'EGRESS', 'SCAN_VOLUME', 'REPOSITORY_COUNT'];
    const states = ['WITHIN', 'NEAR', 'EXCEEDED'];
    for (const dimension of dimensions) {
      for (const state of states) {
        const html = await render({
          dimensions: [row({ dimension, coverage: 'METERED', state, value: 1, envelope: 10000, ...windowBounds })],
          divergences: [],
          generated_at: generatedAt,
        });
        // The surface's standing promise is present on every render.
        expect(html, `${dimension}/${state} must keep the git promise`).toContain('nothing here blocks');
        // No enforcement prose may claim git is blocked, refused or
        // read-only — the throttle vocabulary cannot express it. (The
        // standing promise "nothing here blocks your git traffic" is
        // asserted above; these catch affirmative regressions.)
        const lowered = html.toLowerCase();
        for (const banned of ['git is blocked', 'git operations are blocked', 'git refused', 'read-only']) {
          expect(lowered, `${dimension}/${state} rendered "${banned}"`).not.toContain(banned);
        }
        // The breached state's prose names what IS throttled (CI) and says
        // git stays untouched.
        if (state === 'EXCEEDED') {
          expect(html, `${dimension}/EXCEEDED must name git as untouched`).toContain('git traffic untouched');
        }
      }
    }
  });
});
