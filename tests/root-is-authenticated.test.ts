// T-0067 / ADR-0078 decision 3 — the root stays the repository list.
//
// This guards a mistake nobody makes on purpose. An app whose front page
// demands a login looks like it is missing a public one, and the obvious place
// to put a public one is `/`. From there it grows: a repository count, a
// customer logo wall, a recent-activity strip. Each is a tenant-existence leak
// that arrives looking like a small improvement.
//
// ADR-0078 puts the marketing page on a surface that never receives a session,
// on a different origin, because "makes no BFF calls" is a discipline and a
// separate origin is a property. This test is the discipline's stand-in for the
// one surface that already exists.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RepositoryList from '../src/components/RepositoryList.astro';

const rootPath = fileURLToPath(new URL('../src/pages/index.astro', import.meta.url));
const root = readFileSync(rootPath, 'utf8');

const adr = 'ADR-0078: the marketing page belongs on a surface that never receives a session, on a different origin — not at this app\'s root';

describe('ADR-0078 decision 3 — the root is an authenticated surface', () => {
  it('reads the caller\'s repositories through the BFF', () => {
    // A static splash would import none of this.
    expect(root, adr).toContain('listRepositories');
    expect(root, adr).toContain('RepositoryList');
  });

  it('renders what the caller may see rather than a fixed page', () => {
    // The read is per-request and carries the session; a marketing page has no
    // per-request anything.
    expect(root, adr).toContain('Astro.request');
  });

  it('carries no marketing vocabulary', () => {
    // Not a style objection. Each of these implies an unauthenticated reader,
    // and an unauthenticated reader on this origin is the leak ADR-0078 exists
    // to prevent.
    const lowered = root.toLowerCase();
    for (const pitch of [
      'sign up', 'get started free', 'pricing', 'book a demo', 'start your free',
      'trusted by', 'customers', 'testimonial',
    ]) {
      expect(lowered, `${pitch} — ${adr}`).not.toContain(pitch);
    }
  });

  it('renders no marketing vocabulary once rendered either', async () => {
    const container = await AstroContainer.create();
    const html = (await container.renderToString(RepositoryList, {
      props: { repositories: [], nextPageToken: '' },
    })).toLowerCase();
    for (const pitch of ['sign up', 'pricing', 'get started free', 'trusted by']) {
      expect(html, `${pitch} — ${adr}`).not.toContain(pitch);
    }
  });
});
