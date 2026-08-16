// T-0045 / SPEC-0047 AC2 — the gate must actually fail. A check nobody has
// seen fail is a check nobody knows works, so this drives the real script over
// a fixture tree: one clean file, one violation, one annotated exemption, and
// one stale LEGACY entry.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-hex-literals.mjs', import.meta.url));
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
  root = mkdtempSync(join(tmpdir(), 'gf-hex-'));
  mkdirSync(join(root, 'styles'), { recursive: true });
  // The token file itself may hold literals — that is where they belong.
  writeFileSync(join(root, 'styles', 'tokens.css'), ':root { --gf-ink: #1B2A3A; }');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('SPEC-0047 AC2 — the hex-literal gate', () => {
  it('passes a tree whose only literals are in the token file', () => {
    writeFileSync(join(root, 'clean.astro'), '<p style="color: var(--gf-ink)">ok</p>');
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
  });

  it('fails on a hex literal in a component, naming file and line', () => {
    const offender = join(root, 'offender.astro');
    writeFileSync(offender, '<p>x</p>\n<p style="color:#ff0000">bad</p>\n');
    const { ok, out } = runGate(root);
    expect(ok).toBe(false);
    expect(out).toContain('offender.astro:2');
    expect(out).toContain('#ff0000');
    rmSync(offender);
  });

  it('honours an annotated exemption on the same line', () => {
    const exempt = join(root, 'exempt.astro');
    writeFileSync(exempt, '<p style="color:#ff0000">x</p> <!-- gf-allow-hex: third-party embed -->\n');
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
    rmSync(exempt);
  });

  it('ignores generated code, which we do not author', () => {
    mkdirSync(join(root, 'gen'), { recursive: true });
    writeFileSync(join(root, 'gen', 'thing.ts'), 'export const c = "#abcdef";');
    const { ok, out } = runGate(root);
    expect(ok, out).toBe(true);
  });
});
