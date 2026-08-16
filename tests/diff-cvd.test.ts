// T-0046 / SPEC-0047 AC5 — the diff reads with colour rendering off.
//
// This is the flagship case for ADR-0069. A forge's most-viewed screen encoded
// add-vs-remove as green-vs-red, which is the single worst pair for the ~8% of
// men with deuteranopia or protanopia. The fix is not a nicer green: it is that
// the MEANING moves out of colour entirely, into a text marker in the gutter,
// and the tint becomes reinforcement.
//
// So every assertion below is written to hold with the stylesheet thrown away.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import DiffView from '../src/components/DiffView.astro';
import { parsePatch, ADD_MARKER, DEL_MARKER } from '../src/lib/diff';

const PATCH = `diff --git a/src/auth.go b/src/auth.go
index 1111111..2222222 100644
--- a/src/auth.go
+++ b/src/auth.go
@@ -1,4 +1,4 @@
 package auth
-func check(t string) bool { return true }
+func check(t string) bool { return verify(t) }

 // end
`;

describe('SPEC-0047 AC5 — the unified patch parses into typed lines', () => {
  const lines = parsePatch(PATCH);

  it('classifies added, removed, context, hunk and file-header lines', () => {
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('add');
    expect(kinds).toContain('del');
    expect(kinds).toContain('context');
    expect(kinds).toContain('hunk');
    expect(kinds).toContain('meta');
  });

  it('gives added lines "+" and removed lines a true minus, not a hyphen', () => {
    const add = lines.find((l) => l.kind === 'add')!;
    const del = lines.find((l) => l.kind === 'del')!;
    expect(add.marker).toBe('+');
    expect(del.marker).toBe('−'); // U+2212 MINUS SIGN, not U+002D
    expect(ADD_MARKER).toBe('+');
    expect(DEL_MARKER).toBe('−');
  });

  it('strips the marker column from the content it renders', () => {
    const add = lines.find((l) => l.kind === 'add')!;
    expect(add.content.startsWith('+')).toBe(false);
    expect(add.content).toContain('verify(t)');
  });

  it('does not mistake the +++/--- file headers for added and removed lines', () => {
    const headers = lines.filter((l) => l.content.startsWith('+++') || l.content.startsWith('---'));
    for (const h of headers) expect(h.kind).toBe('meta');
  });

  it('carries both old and new line numbers, so position is a channel too', () => {
    const ctx = lines.find((l) => l.kind === 'context')!;
    expect(ctx.oldLine).toBeGreaterThan(0);
    expect(ctx.newLine).toBeGreaterThan(0);
    const add = lines.find((l) => l.kind === 'add')!;
    expect(add.oldLine).toBeNull();
    expect(add.newLine).toBeGreaterThan(0);
  });

  it('treats an empty patch as no lines rather than one blank line', () => {
    expect(parsePatch('')).toEqual([]);
  });
});

describe('SPEC-0047 AC5 — the rendered diff carries its meaning in text', () => {
  async function render(patch: string): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(DiffView, { props: { patch } });
  }

  it('renders a text marker in the gutter of every changed line', async () => {
    const html = await render(PATCH);
    // The markers are DOM text, not ::before content and not a background —
    // strip every attribute and they must survive.
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).toContain('+');
    expect(text).toContain('−');
  });

  it('marks each changed line with a data attribute a test can read without colour', async () => {
    const html = await render(PATCH);
    expect(html).toContain('data-diff-kind="add"');
    expect(html).toContain('data-diff-kind="del"');
  });

  it('names the change in the accessible name, not only in the tint', async () => {
    const html = await render(PATCH);
    // A screen reader user gets "added"/"removed", not a colour they cannot see.
    expect(html).toMatch(/aria-label="added line"|<span[^>]*>added<\/span>/i);
    expect(html).toMatch(/aria-label="removed line"|<span[^>]*>removed<\/span>/i);
  });

  it('uses diff tokens for the tint and never a hex literal', async () => {
    const html = await render(PATCH);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).toContain('gf-diff-add');
    expect(html).toContain('gf-diff-del');
  });

  it('renders an empty patch as an explicit statement, not as blankness', async () => {
    const html = await render('');
    expect(html.replace(/<[^>]+>/g, ' ')).toMatch(/no differences/i);
  });
});
