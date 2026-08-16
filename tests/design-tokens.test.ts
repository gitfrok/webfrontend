// T-0045 / SPEC-0047 AC1, AC3, AC4: the token layer is the only source of
// colour, both themes are defined together so they cannot drift, the fonts are
// ours, and every interactive element keeps a visible focus ring.
//
// These assertions read the shipped stylesheet as text rather than through a
// browser: the point is that the DEFINITIONS exist and are complete, which is a
// property of the file. Whether a given component uses them is AC2's gate.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tokensPath = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));
const css = readFileSync(tokensPath, 'utf8');

// The Frost/Deepfreeze pairs exactly as SPEC-0047 § Binding tokens fixes them.
// A token missing from either theme is the drift this test exists to prevent.
const TOKENS: Array<[name: string, frost: string, deepfreeze: string]> = [
  ['--gf-paper', '#F7F9FB', '#15202B'],
  ['--gf-surface', '#FFFFFF', '#1E2A38'],
  ['--gf-soft', '#EDF2F7', '#243242'],
  ['--gf-ink', '#1B2A3A', '#E8EEF4'],
  ['--gf-ink-muted', '#5A6B7C', '#9FB0C0'],
  ['--gf-line', '#DCE4EC', '#33465A'],
  ['--gf-stick', '#9AA5B1', '#6E7E8F'],
  ['--gf-code-bg', '#F1F5F9', '#101923'],
  ['--gf-action', '#0072B2', '#0072B2'],
  ['--gf-action-hover', '#005E94', '#1F86C9'],
  ['--gf-action-ink', '#0072B2', '#7CC6EE'],
  ['--gf-success', '#009E73', '#2FC499'],
  ['--gf-success-ink', '#00664B', '#2FC499'],
  ['--gf-danger', '#D55E00', '#F07B2D'],
  ['--gf-danger-ink', '#A34700', '#F07B2D'],
  ['--gf-warn', '#E69F00', '#F2B33D'],
  ['--gf-warn-ink', '#8A6100', '#F2B33D'],
  ['--gf-info', '#56B4E9', '#7CC6EE'],
  ['--gf-info-ink', '#0072B2', '#7CC6EE'],
  ['--gf-diff-add-bg', '#E3F0FB', '#1C3A52'],
  ['--gf-diff-add-ink', '#0072B2', '#7CC6EE'],
  ['--gf-diff-del-bg', '#FCEBD4', '#4A3010'],
  ['--gf-diff-del-ink', '#A34700', '#F2B33D'],
];

// The brand ramp is constant across themes — slice identity is carried by
// lightness order, which is what makes the mark survive every CVD simulation.
const BRAND: Array<[string, string]> = [
  ['--gf-frost', '#A6D8F5'],
  ['--gf-sky', '#56B4E9'],
  ['--gf-blue', '#1F86C9'],
  ['--gf-deep', '#0B5E96'],
  ['--gf-mango', '#E69F00'],
];

/** The `:root` block — the Frost (light) theme, which is the only default. */
function frostBlock(): string {
  const m = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('tokens.css defines no :root block');
  return m[1];
}

/** The Deepfreeze block, opted into by data-theme or the media query. */
function deepfreezeBlocks(): string {
  const explicit = css.match(/\[data-theme=['"]deepfreeze['"]\]\s*\{([\s\S]*?)\n\}/);
  const media = css.match(/prefers-color-scheme:\s*dark[\s\S]*?\{([\s\S]*?)\n\s*\}/);
  return `${explicit?.[1] ?? ''}\n${media?.[1] ?? ''}`;
}

describe('SPEC-0047 AC1 — one token layer, both themes', () => {
  const frost = frostBlock();
  const deep = deepfreezeBlocks();

  it.each(TOKENS)('%s is defined in Frost as %s', (name, value) => {
    expect(frost).toMatch(new RegExp(`${name}:\\s*${value}\\s*;`, 'i'));
  });

  it.each(TOKENS)('%s is defined in Deepfreeze (Frost %s → dark %s)', (name, _frost, dark) => {
    expect(deep).toMatch(new RegExp(`${name}:\\s*${dark}\\s*;`, 'i'));
  });

  it.each(BRAND)('brand ramp %s = %s is theme-invariant', (name, value) => {
    expect(frost).toMatch(new RegExp(`${name}:\\s*${value}\\s*;`, 'i'));
  });

  it('defines the shape, motion and focus scale the brand fixes', () => {
    for (const token of [
      '--gf-radius-control: 10px',
      '--gf-radius-card: 16px',
      '--gf-radius-pill: 999px',
      '--gf-motion-fast: 120ms',
      '--gf-motion-base: 200ms',
      '--gf-motion-slow: 320ms',
      '--gf-focus-width: 2px',
      '--gf-focus-offset: 2px',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('collapses motion to an opacity fade under prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe('SPEC-0047 AC3 — the fonts are ours', () => {
  it('requests nothing from the Google Fonts CDN', () => {
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it.each(['Inter', 'Baloo2', 'JetBrainsMono'])('serves %s.woff2 from our own origin', (family) => {
    expect(css).toContain(`/fonts/${family}.woff2`);
    expect(existsSync(fileURLToPath(new URL(`../public/fonts/${family}.woff2`, import.meta.url)))).toBe(true);
  });

  it('declares font-display: swap so text is never invisible while loading', () => {
    const faces = css.match(/@font-face\s*\{[\s\S]*?\}/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(3);
    for (const face of faces) expect(face).toMatch(/font-display:\s*swap/);
  });
});

describe('SPEC-0047 AC4 — focus is visible', () => {
  it('gives every focus-visible element a 2px action-coloured ring at 2px offset', () => {
    const rule = css.match(/:focus-visible\s*\{([\s\S]*?)\}/);
    expect(rule, 'tokens.css defines no :focus-visible rule').not.toBeNull();
    expect(rule![1]).toMatch(/outline:\s*var\(--gf-focus-width\)\s+solid\s+var\(--gf-action\)/);
    expect(rule![1]).toMatch(/outline-offset:\s*var\(--gf-focus-offset\)/);
  });

  it('never removes an outline without replacing it', () => {
    // `outline: none` is the single most common way a design system loses its
    // keyboard affordance. If it appears at all, it must be immediately
    // followed by a replacement outline in the same rule.
    const offenders = [...css.matchAll(/\{[^}]*outline:\s*(none|0)[^}]*\}/g)]
      .filter((m) => !/outline:\s*var\(--gf-focus-width\)/.test(m[0]));
    expect(offenders.map((m) => m[0])).toEqual([]);
  });
});
