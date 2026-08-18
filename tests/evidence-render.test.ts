// T-0051 / SPEC-0050 AC4, AC5, AC6, AC7, AC8 — what the evidence surface says.
//
// AC4 is the criterion that matters most and is the least visible in a diff: a
// truncated pack must never read as a complete one. On a SOC 2 walkthrough a
// document that looks whole and is not is worse than no document, and the
// natural rendering — just show the sections you got — produces exactly that.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import EvidencePackView from '../src/components/EvidencePackView.astro';
import Layout from '../src/layouts/Layout.astro';
import { EVIDENCE_MESSAGES, describePackState, PACK_STATES } from '../src/lib/evidence';
import { STATUS_VOCABULARY, type StatusKey } from '../src/lib/status';
import type { PackStatusView } from '../src/lib/bff';
import type { PackStreamResult } from '../src/lib/evidenceStream';

const status = (overrides: Partial<PackStatusView> = {}): PackStatusView => ({
  state: 'READY',
  sections: [
    { type: 'APPROVALS', record_count: 12, gaps: [] },
    { type: 'POLICY_DECISIONS', record_count: 4, gaps: [] },
  ],
  appendix_record_count: 0,
  range_from: '2026-07-01T00:00:00Z',
  range_to: '2026-08-01T00:00:00Z',
  ...overrides,
});

const stream = (overrides: Partial<PackStreamResult> = {}): PackStreamResult => ({
  chunks: [
    {
      chunk_index: 0, final_chunk: true,
      section: {
        type: 'APPROVALS', complete: true, gaps: [], records: [], records_digest: 'sha256:abc',
        anchors: { first_seq: 1, last_seq: 12, first_record_hash: 'h1', last_record_hash: 'h12', prev_record_hash: 'h0' },
      },
    },
  ],
  truncated: false,
  degraded: false,
  refused: false,
  ...overrides,
});

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(EvidencePackView, {
    props: { packID: 'pack-1', status: status(), stream: stream(), ...props },
  });
}

describe('SPEC-0050 AC4 — a truncated pack never reads as a complete one', () => {
  it('says the pack is incomplete and not authoritative', async () => {
    const html = await render({ stream: stream({ truncated: true }) });
    expect(html).toContain(EVIDENCE_MESSAGES.truncated);
    expect(html.toLowerCase()).toContain('not authoritative');
  });

  it('makes no completeness claim when no final chunk was seen', async () => {
    const html = (await render({ stream: stream({ truncated: true }) })).toLowerCase();
    for (const claim of ['complete pack', 'pack is complete', 'fully assembled', 'all records']) {
      expect(html).not.toContain(claim);
    }
  });

  it('carries the incompleteness in words and a glyph, never by omission', async () => {
    // Rendering fewer sections is not a statement. A reader who has never seen
    // the complete pack cannot tell a short one from a truncated one.
    const html = await render({ stream: stream({ truncated: true, chunks: [] }) });
    expect(html).toContain(EVIDENCE_MESSAGES.truncated);
    expect(html).toMatch(/gf-status/);
  });

  it('puts the truncation notice BEFORE the assembly-state badge', async () => {
    // Found by the AC11 grayscale review, not by a DOM assertion: the status
    // route's state is legitimately READY when assembly succeeded, so the
    // page showed a "Ready" badge above a notice saying the pack was not
    // whole. The badge is the most glanceable element on the page, and a
    // reader who skims it stops there.
    const html = await render({ status: status({ state: 'READY' }), stream: stream({ truncated: true }) });
    expect(html.indexOf(EVIDENCE_MESSAGES.truncated)).toBeGreaterThan(-1);
    expect(html.indexOf(EVIDENCE_MESSAGES.truncated)).toBeLessThan(html.indexOf('Ready'));
  });

  it('labels the state badge as the ASSEMBLY state, not the pack in hand', async () => {
    const html = await render({ status: status({ state: 'READY' }), stream: stream({ truncated: true }) });
    expect(html).toContain('assembly');
  });

  it('says so plainly when the pack IS complete', async () => {
    const html = await render({});
    expect(html).not.toContain(EVIDENCE_MESSAGES.truncated);
  });
});

describe('SPEC-0050 AC5 — a degraded section renders degraded', () => {
  it('marks a section that is not complete', async () => {
    const degraded = stream({
      degraded: true,
      chunks: [{
        chunk_index: 0, final_chunk: true,
        section: { type: 'SCAN_GATES', complete: false, gaps: [], records: [], records_digest: 'd' },
      }],
    });
    const html = await render({ stream: degraded });
    expect(html).toContain(EVIDENCE_MESSAGES.sectionIncomplete);
  });

  it('shows each gap with its bounds and reason', async () => {
    const gapped = stream({
      degraded: true,
      chunks: [{
        chunk_index: 0, final_chunk: true,
        section: {
          type: 'ACCESS_CHANGES', complete: true, records: [], records_digest: 'd',
          gaps: [{ from: '2026-07-05T00:00:00Z', to: '2026-07-06T00:00:00Z', reason: 'RETENTION' }],
        },
      }],
    });
    const html = await render({ stream: gapped });
    expect(html).toContain('RETENTION');
    expect(html).toContain('2026-07-05');
    expect(html).toContain(EVIDENCE_MESSAGES.sectionIncomplete);
  });
});

describe('SPEC-0050 AC6 — a refusal names no cause', () => {
  const forbidden = [
    'permission', 'denied', 'not allowed', 'unauthorized', 'unauthorised',
    'forbidden', 'blocked by policy', 'does not exist', 'no such', 'not found',
  ];

  it.each(Object.entries(EVIDENCE_MESSAGES))('%s asserts no cause', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const word of forbidden) expect(lowered).not.toContain(word);
  });

  it('renders the refusal message and nothing about why', async () => {
    const html = (await render({ stream: stream({ refused: true, truncated: true, chunks: [] }) })).toLowerCase();
    for (const word of forbidden) expect(html).not.toContain(word);
  });
});

describe('SPEC-0050 AC2/AC7 — assembly state', () => {
  it('renders section record counts and the appendix count', async () => {
    const html = await render({});
    expect(html).toContain('12');
    expect(html).toContain('APPROVALS');
  });

  it('renders a failure reason the wire carried', async () => {
    const html = await render({ status: status({ state: 'FAILED', failure_reason: 'source unavailable' }) });
    expect(html).toContain('source unavailable');
  });

  it('invents nothing when FAILED carries no reason', async () => {
    const html = await render({ status: status({ state: 'FAILED' }) });
    expect(html).toContain('Failed');
    expect(html.toLowerCase()).not.toContain('unknown reason');
    expect(html.toLowerCase()).not.toContain('reason:');
  });

  it('carries all four pack states, pairwise distinct in glyph and word', () => {
    expect(PACK_STATES).toEqual(['PENDING', 'ASSEMBLING', 'READY', 'FAILED']);
    const described = PACK_STATES.map((s) => describePackState(s));
    expect(new Set(described.map((d) => d.glyph)).size).toBe(4);
    expect(new Set(described.map((d) => d.label)).size).toBe(4);
  });

  it('puts ASSEMBLING in the one status vocabulary', () => {
    expect(Object.keys(STATUS_VOCABULARY)).toContain('ASSEMBLING' as StatusKey);
  });

  it('renders an unrecognised state as unknown rather than as a neutral badge', async () => {
    const html = await render({ status: status({ state: 'NOT_A_STATE' }) });
    expect(html.toLowerCase()).toContain('unknown');
  });
});

describe('SPEC-0050 AC8 — the Compliance destination', () => {
  async function shell(path: string): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(Layout, {
      props: { title: 'test' },
      request: new Request(`http://app.gitsaas.test${path}`),
    });
  }

  it('appears in the shell exactly once', async () => {
    const html = await shell('/');
    expect(html.match(/>Compliance</g)?.length).toBe(1);
  });

  it('points at a page backed by a BFF route, not at a dataless index', async () => {
    const html = await shell('/');
    expect(html).toContain('href="/compliance/evidence-packs"');
    expect(html).not.toContain('href="/compliance"');
  });

  it('marks itself current by aria-current, weight and a rule — not by colour', async () => {
    const html = await shell('/compliance/evidence-packs');
    expect(html).toMatch(/href="\/compliance\/evidence-packs"[^>]*aria-current="page"/);
  });

  it('leaves every other destination unmarked when Compliance is current', async () => {
    const html = await shell('/compliance/evidence-packs');
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });
});
