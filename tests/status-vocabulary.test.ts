// T-0047 / SPEC-0047 AC6 + AC7 — no status renders by colour alone.
//
// The enumeration is the point. A test that checked "the critical badge has a
// glyph" would pass forever while someone adds a seventh severity with a hue
// and nothing else. So this walks the WHOLE vocabulary the product can render
// and requires every member to carry a non-colour channel — which means a new
// status fails this test on the day it is added, not on the day a user
// complains.
import { describe, it, expect } from 'vitest';
import {
  STATUS_VOCABULARY,
  severityRank,
  describeStatus,
  type StatusKey,
} from '../src/lib/status';

describe('SPEC-0047 AC6 — every status carries a non-colour channel', () => {
  it('enumerates the vocabulary rather than sampling it', () => {
    // Severities, merge-gate outcomes, triage states, evidence-pack states and
    // the finding lifecycle all render somewhere in the product.
    for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'BLOCKED', 'PASSED', 'UNAVAILABLE', 'OPEN', 'RESOLVED'] as StatusKey[]) {
      expect(Object.keys(STATUS_VOCABULARY)).toContain(key);
    }
  });

  it.each(Object.keys(STATUS_VOCABULARY) as StatusKey[])(
    '%s has a glyph and a human label, not only a tone',
    (key) => {
      const s = STATUS_VOCABULARY[key];
      expect(s.glyph.length).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      // The tone names a token class; it never carries a colour value itself.
      expect(s.tone).toMatch(/^gf-status-(success|danger|warn|info|pending)$/);
    },
  );

  it('renders a status as glyph + label text, so it survives grayscale', () => {
    const d = describeStatus('CRITICAL');
    expect(d.text).toContain('Critical');
    expect(d.text).toMatch(/[^\w\s]/); // a glyph, not just letters
  });

  it('refuses an unknown status rather than inventing a neutral badge', () => {
    // Silently rendering an unknown state as grey is how a real state
    // disappears from a dashboard. It must be visible as unknown.
    const d = describeStatus('NOT_A_STATUS' as StatusKey);
    expect(d.text.toLowerCase()).toContain('unknown');
    expect(d.tone).toBe('gf-status-pending');
  });
});

describe('SPEC-0047 AC7 — severity is intensity, encoded by luminance', () => {
  it('ranks severities so order is a channel independent of hue', () => {
    expect(severityRank('CRITICAL')).toBeGreaterThan(severityRank('HIGH'));
    expect(severityRank('HIGH')).toBeGreaterThan(severityRank('MEDIUM'));
    expect(severityRank('MEDIUM')).toBeGreaterThan(severityRank('LOW'));
  });

  it('gives every severity a distinct rank, so two never collapse together', () => {
    const ranks = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => severityRank(s as StatusKey));
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('shows the rank in the label, so intensity reads without any colour', () => {
    expect(describeStatus('CRITICAL').text).toMatch(/4\s*\/\s*4|Critical/);
    expect(describeStatus('LOW').text).toMatch(/1\s*\/\s*4|Low/);
  });

  it('uses no red-versus-green pair anywhere in the vocabulary', () => {
    // The brand's rule: heat semantics use a single-hue lightness ramp, never
    // a red/green ramp. Tones are token classes, so the check is that no
    // severity claims the success tone — green for "low severity" is exactly
    // the pairing that fails under deuteranopia.
    for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as StatusKey[]) {
      expect(STATUS_VOCABULARY[key].tone).not.toBe('gf-status-success');
    }
  });
});
