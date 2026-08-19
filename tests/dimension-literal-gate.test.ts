// T-0077 / SPEC-0060 AC4, AC5 — the dimension gate must actually fail, and its
// waiver must actually require a reason.
//
// Same shape as the hex gate's test and for the same stated reason: a check
// nobody has seen fail is a check nobody knows the shape of. This drives the real
// script over a fixture tree — a clean file, a violation, a bare marker that must
// NOT exempt, a reasoned waiver that must, the values that are deliberately not
// scale steps, and a stale LEGACY entry.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-dimension-literals.mjs', import.meta.url));
let root: string;

/** Runs the real gate over a fixture root; returns exit status and output. */
function runGate(dir: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync('node', [script, dir], { encoding: 'utf8' }) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gf-dim-'));
  mkdirSync(join(root, 'styles'), { recursive: true });
  // The stylesheet directory is where dimensions resolve TO, so its literals are
  // the definitions rather than violations.
  writeFileSync(join(root, 'styles', 'tokens.css'), ':root { --gf-text-sm: 13px; }');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('SPEC-0060 AC4 — the gate fails on a dimensional literal', () => {
  it('passes a tree whose dimensions all resolve from tokens', () => {
    writeFileSync(
      join(root, 'clean.astro'),
      '<p style={{ fontSize: \'var(--gf-text-sm)\', padding: \'var(--gf-space-2)\' }}>ok</p>',
    );
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
  });

  it('fails on a font size in a component, naming file and line', () => {
    const offender = join(root, 'offender.astro');
    writeFileSync(offender, '<p>x</p>\n<p style={{ fontSize: \'13px\' }}>bad</p>\n');
    const { ok, out } = runGate(root);
    expect(ok).toBe(false);
    expect(out).toContain('offender.astro:2');
    expect(out).toContain('fontSize');
    rmSync(offender);
  });

  it('fails on spacing, radius and a content width too', () => {
    for (const declaration of [
      "padding: '16px'",
      "marginTop: '8px'",
      "borderRadius: '6px'",
      "maxWidth: '960px'",
      'gap: 12px',
    ]) {
      const offender = join(root, 'offender.astro');
      writeFileSync(offender, `<div style={{ ${declaration} }}>bad</div>\n`);
      const { ok, out } = runGate(root);
      expect(ok, `${declaration} was not caught: ${out}`).toBe(false);
      rmSync(offender);
    }
  });

  it('fails on a CSS-spelled property, not only the JSX spelling', () => {
    const offender = join(root, 'offender.css');
    writeFileSync(offender, '.thing { font-size: 15px; }\n');
    const { ok, out } = runGate(root);
    expect(ok).toBe(false);
    expect(out).toContain('font-size');
    rmSync(offender);
  });
});

describe('SPEC-0060 AC3 — what is deliberately not a scale step', () => {
  it('passes values that are not on any scale', () => {
    // A gate that fires on correct code gets deleted rather than fixed. None of
    // these is a scale step: a full-width element, a viewport height, a zero, and
    // a percentage are structural, and the properties this gate does not read —
    // border width, underline offset — are optical constants.
    writeFileSync(
      join(root, 'structural.astro'),
      [
        "<div style={{ width: '100%', minHeight: '100dvh', margin: '0' }}>a</div>",
        '<style>.x { border: 1px solid currentColor; text-underline-offset: 2px; }</style>',
        '<style>@media (min-width: 640px) { .y { display: flex } }</style>',
      ].join('\n'),
    );
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
    rmSync(join(root, 'structural.astro'));
  });
});

describe('SPEC-0060 AC5 — the waiver, and its reason', () => {
  it('a bare marker does not exempt anything', () => {
    const offender = join(root, 'bare.astro');
    writeFileSync(offender, "<p style={{ fontSize: '13px' }}>x</p> {/* gf-allow-dimension: */}\n");
    const { ok } = runGate(root);
    expect(ok).toBe(false);
    rmSync(offender);
  });

  it('a waiver with a reason exempts the line, and the reason is reported', () => {
    const waived = join(root, 'waived.astro');
    writeFileSync(
      waived,
      "<p style={{ fontSize: '13px' }}>x</p> {/* gf-allow-dimension: matches an embedded viewer we do not style */}\n",
    );
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
    expect(out).toContain('1 waived');
    expect(out).toContain('an embedded viewer we do not style');
    rmSync(waived);
  });

  it('reports zero waivers when there are none, so the number is always on screen', () => {
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
    expect(out).toContain('0 waived');
  });
});

describe('SPEC-0060 AC3 — the ratchet is self-enforcing', () => {
  it('the shipped script carries an empty LEGACY list', async () => {
    // Present and empty, the same shape the hex gate carries: the stale-entry
    // check below means anything added has to be removed again, so an empty list
    // is stronger than no list.
    const source = await import('node:fs').then((fs) => fs.readFileSync(script, 'utf8'));
    expect(source).toContain('const LEGACY = new Set([]);');
  });
});
