// T-0077 / SPEC-0060 AC1, AC2, AC6, AC7, AC8 — the token layer is complete, the
// scale is the one ADR-0079 governs, and the shell renders exactly one heading.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PageShell from '../src/components/PageShell.astro';
import { measureFor } from '../src/lib/shell';

const tokens = readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8');
const pagesDir = fileURLToPath(new URL('../src/pages', import.meta.url));

/** Every .astro page, recursively — the API routes are .ts and excluded by extension. */
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return pages(full);
    return entry.endsWith('.astro') ? [full] : [];
  });
}

describe('SPEC-0060 AC1/AC2 — the token layer, extended', () => {
  it('defines the seven-step type scale ADR-0079 governs, at the values it names', () => {
    // The values are asserted, not just the names: a later "small tweak" to the
    // scale then shows up as a diff against a governed table rather than as a CSS
    // edit nobody reviewed.
    const scale: Array<[string, string]> = [
      ['--gf-text-xs', '12px'],
      ['--gf-text-sm', '13px'],
      ['--gf-text-base', '14px'],
      ['--gf-text-md', '16px'],
      ['--gf-text-lg', '18px'],
      ['--gf-text-xl', '20px'],
      ['--gf-text-2xl', '22px'],
    ];
    for (const [token, value] of scale) {
      expect(tokens, `${token} must be defined`).toContain(`${token}: ${value};`);
    }
  });

  it('keeps the spacing scale and the radius set it already had', () => {
    for (const token of ['--gf-space-1', '--gf-space-2', '--gf-space-3', '--gf-space-4', '--gf-space-6', '--gf-space-8']) {
      expect(tokens).toContain(`${token}:`);
    }
    for (const token of ['--gf-radius-control', '--gf-radius-card', '--gf-radius-pill']) {
      expect(tokens).toContain(`${token}:`);
    }
  });

  it('defines exactly one content measure per name, and no page-specific width', () => {
    expect(tokens).toContain('--gf-measure: 960px;');
    expect(tokens).toContain('--gf-measure-wide: 1080px;');
    // 760px was one of the three widths pages used to declare. If it comes back as
    // a token, the three-widths problem has been re-created with better spelling.
    expect(tokens).not.toContain('760px');
  });

  it('resolves a measure name to a token, and never to a number', () => {
    expect(measureFor('prose')).toBe('var(--gf-measure)');
    expect(measureFor('wide')).toBe('var(--gf-measure-wide)');
  });
});

describe('SPEC-0060 AC6 — one content width, owned by the shell', () => {
  it('no page declares a width of its own', () => {
    const offenders = pages(pagesDir).filter((file) => /maxWidth|max-width/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.replace(pagesDir, ''))).toEqual([]);
  });

  it('every page that renders markup composes the shell', () => {
    // The raw-file route is excluded by what it IS rather than by name: it renders
    // no Layout because it is a byte proxy, and a proxy has no content column to
    // own. Anything that renders a Layout has one.
    const offenders = pages(pagesDir)
      .map((file) => [file, readFileSync(file, 'utf8')] as const)
      .filter(([, source]) => source.includes('<Layout'))
      .filter(([, source]) => !source.includes('PageShell'))
      .map(([file]) => file.replace(pagesDir, ''));
    expect(offenders).toEqual([]);
  });
});

describe('SPEC-0060 AC7 — the heading is rendered once', () => {
  it('renders one h1 when the shell owns the heading', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PageShell, {
      props: { title: 'Repositories', lede: 'What your access covers.' },
      slots: { default: '<p>content</p>' },
    });
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(html).toContain('Repositories');
    expect(html).toContain('What your access covers.');
    expect(html).toContain('content');
  });

  it('renders no h1 when the page carries its own header, but keeps the title readable', async () => {
    // Two h1s is the failure a shell most easily introduces: a page that keeps its
    // heading and composes one as well. The title still travels — screen readers
    // get it — it simply is not a second heading.
    const container = await AstroContainer.create();
    const html = await container.renderToString(PageShell, {
      props: { title: 'Add the thing', headingHidden: true },
      slots: { default: '<h1>Add the thing</h1>' },
    });
    expect(html.match(/<h1/g) ?? []).toHaveLength(1);
    expect(html).toContain('gf-sr-only');
  });

  it('takes a measure name, never a number', async () => {
    const container = await AstroContainer.create();
    const wide = await container.renderToString(PageShell, { props: { title: 'Pipelines', measure: 'wide' } });
    expect(wide).toContain('var(--gf-measure-wide)');
    const prose = await container.renderToString(PageShell, { props: { title: 'Policy' } });
    expect(prose).toContain('var(--gf-measure)');
    expect(prose).not.toMatch(/max-width:\s*\d+px/);
  });
});

describe('SPEC-0060 AC8 — cards stop hand-rolling corners', () => {
  it('no component sets a radius outside the token set', () => {
    // The gate enforces this over the whole tree; this asserts the specific shape
    // ADR-0079 decision 6 named, so a reader of this suite sees the rule.
    const componentsDir = fileURLToPath(new URL('../src/components', import.meta.url));
    const offenders: string[] = [];
    for (const file of readdirSync(componentsDir)) {
      const source = readFileSync(join(componentsDir, file), 'utf8');
      // A pixel radius is the violation. A shorthand starting with `0` — as in
      // '0 var(--gf-radius-control) ...' for a one-sided corner — is not one, and
      // an assertion that flagged it would be flagging correct code.
      if (/border-?[rR]adius:[^;'"]*'?[^'";]*\d+(px|rem|em)/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
