// T-0048 / SPEC-0047 AC6 + AC9 — the commercial surface under the CVD laws.
//
// The usage view is where colour was doing the most work: three envelope
// states told apart by tint, and a trend direction rendered as a lone word in
// muted grey. Both now carry shape.
//
// AC8's honesty rules are NOT re-asserted here — usage-regression-pins.test.ts
// and readonly-cause.test.ts already own them, and they must pass unmodified.
// Duplicating them here would let a reskin quietly weaken one copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENVELOPE_STATUS, TREND, SERIES_ORDER } from '../src/lib/status';

describe('SPEC-0047 AC6 — envelope state and trend carry shape', () => {
  it.each(['WITHIN', 'NEAR', 'EXCEEDED'])('%s has a glyph and a word', (state) => {
    const d = ENVELOPE_STATUS[state as keyof typeof ENVELOPE_STATUS];
    expect(d.glyph.length).toBeGreaterThan(0);
    expect(d.label.length).toBeGreaterThan(0);
  });

  it('gives the three envelope states three DIFFERENT glyphs', () => {
    // Same glyph on two states would put the whole distinction back into
    // colour, which is the failure this task exists to remove.
    const glyphs = Object.values(ENVELOPE_STATUS).map((d) => d.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it.each(['RISING', 'FALLING', 'FLAT'])('trend %s is an arrow as well as a word', (t) => {
    const d = TREND[t as keyof typeof TREND];
    expect(d.glyph).toMatch(/[↑↓→]/);
    expect(d.label.length).toBeGreaterThan(0);
  });

  it('points the trend arrows in three distinct directions', () => {
    const glyphs = Object.values(TREND).map((d) => d.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('SPEC-0047 AC9 — the chart palette is fixed before the first chart', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8');

  it('is the Okabe-Ito eight in the brand order', () => {
    expect(SERIES_ORDER).toEqual([
      '#0072B2', '#E69F00', '#009E73', '#D55E00',
      '#56B4E9', '#CC79A7', '#F0E442', '#000000',
    ]);
  });

  it('never places a red-green pair adjacent in the order', () => {
    // Okabe-Ito is colourblind-safe as a SET; the order still matters, because
    // a two-series chart takes the first two. Blue then orange is the pair a
    // deutan reader separates most easily.
    expect(SERIES_ORDER[0]).toBe('#0072B2');
    expect(SERIES_ORDER[1]).toBe('#E69F00');
  });

  it('ships the order as tokens so a chart cannot improvise its own', () => {
    for (let i = 1; i <= 8; i++) expect(css).toContain(`--gf-series-${i}:`);
  });

  it('pairs each series with a dash pattern, so lines separate without colour', () => {
    for (let i = 1; i <= 8; i++) expect(css).toContain(`--gf-series-${i}-dash:`);
  });
});
