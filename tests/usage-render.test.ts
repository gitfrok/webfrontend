import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import UsageView from '../src/components/UsageView.astro';
import type { UsageDimensionView, UsageViewResponse } from '../src/lib/bff';

function row(overrides: Partial<UsageDimensionView> & Pick<UsageDimensionView, 'dimension' | 'coverage'>): UsageDimensionView {
  return { gaps: [], ...overrides };
}

function view(dimensions: UsageDimensionView[], divergences: UsageViewResponse['divergences'] = []): UsageViewResponse {
  return { dimensions, divergences, generated_at: '2026-08-15T12:00:00Z' };
}

async function render(props: { view: UsageViewResponse }): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(UsageView, { props });
}

// SPEC-0041 as the reader sees it: one row per PRD §6 dimension, metered
// rows carrying the control plane's counter and its interval — and
// unmeasured rows rendered as a visible gap with a reason, NEVER as zero
// (AC2, AC3).
describe('usage view rendering', () => {
  it('renders a metered dimension with its counter, envelope and interval', async () => {
    const html = await render({
      view: view([
        row({
          dimension: 'CI_MINUTES', coverage: 'METERED', state: 'WITHIN',
          value: 42, envelope: 10000, notification: 8000, unit: 'minutes',
          window_start: '2026-08-15T11:00:00Z', window_end: '2026-08-15T12:00:00Z',
        }),
      ]),
    });
    expect(html).toContain('CI job minutes');
    expect(html).toContain('42');
    expect(html).toContain('10,000');
    expect(html).toContain('notify at 8,000');
    expect(html).toContain('2026-08-15T11:00');
    expect(html).toContain('WITHIN');
  });

  it('renders a DEFERRED dimension as unmeasured with its reason — never a number', async () => {
    const html = await render({
      view: view([row({ dimension: 'SEATS', coverage: 'DEFERRED', deferred_reason: 'no authoritative telemetry source yet' })]),
    });
    expect(html).toContain('Not metered yet');
    expect(html).toContain('No measurement in this phase');
    expect(html).toContain('no authoritative telemetry source yet');
    // AC2: the row's cells carry no rendered number — not even a zero.
    const seatsRow = html.slice(html.indexOf('data-dimension="SEATS"'), html.indexOf('</tr>', html.indexOf('data-dimension="SEATS"')));
    expect(seatsRow).not.toContain('data-usage-value');
    expect(seatsRow).not.toMatch(/>0[ .,]*/);
  });

  it('renders a telemetry gap as a visible gap with its intervals — never zero usage', async () => {
    const html = await render({
      view: view([
        row({
          dimension: 'EGRESS', coverage: 'METERED', telemetry_gap: true,
          gaps: [{ window_start: '2026-08-15T11:00:00Z', window_end: '2026-08-15T12:00:00Z', reason: 'no telemetry received' }],
        }),
      ]),
    });
    expect(html).toContain('Telemetry gap');
    expect(html).toContain('No telemetry received');
    expect(html).toContain('no telemetry received');
    // AC3: the gapped row presents no value cell at all.
    const gapRow = html.slice(html.indexOf('data-dimension="EGRESS"'), html.indexOf('</tr>', html.indexOf('data-dimension="EGRESS"')));
    expect(gapRow).not.toContain('data-usage-value');
    expect(gapRow).not.toMatch(/>0[ .,]*/);
  });

  it('renders a divergence as a health finding carrying both numbers', async () => {
    const html = await render({
      view: view(
        [row({ dimension: 'CI_MINUTES', coverage: 'METERED', state: 'WITHIN', value: 100, envelope: 10000, unit: 'minutes' })],
        [{
          dimension: 'CI_MINUTES', data_plane_id: 'plane-1',
          control_plane_value: 100, data_plane_reported_value: 90,
          window_start: '2026-08-15T11:00:00Z', window_end: '2026-08-15T12:00:00Z',
        }],
      ),
    });
    expect(html).toContain('Health findings');
    expect(html).toContain('plane-1');
    expect(html).toContain('100');
    expect(html).toContain('90');
    expect(html).toContain('never a');
  });

  it('omits the divergence section when the control plane and the planes agree', async () => {
    const html = await render({ view: view([row({ dimension: 'CI_MINUTES', coverage: 'METERED', state: 'WITHIN', value: 1, envelope: 10000 })]) });
    expect(html).not.toContain('Health findings');
  });
});
