// T-0055 / SPEC-0052 AC11, AC12 — what the landing page is allowed to say.
//
// This is the surface where a false absence claim would be most believed. A
// reader who sees "you have no repositories" concludes the product is empty;
// the honest reading is that nothing here is visible to them, which is also
// true when a repository exists on disk that the registry never learned about
// (ADR-0071 decision 2).
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RepositoryList from '../src/components/RepositoryList.astro';
import { REPOSITORY_MESSAGES } from '../src/lib/repositories';
import type { RepositorySummary } from '../src/lib/bff';

const repo = (id: string, name: string): RepositorySummary => ({ repository_id: id, name });

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(RepositoryList, {
    props: { repositories: [repo('acme/web', 'Web')], nextPageToken: '', ...props },
  });
}

describe('SPEC-0052 AC11 — an empty list claims no absence', () => {
  const forbidden = [
    'you have no repositories', 'no repositories', 'there are none', 'nothing exists',
    'not found', '0 repositories', 'empty tenant',
  ];

  it.each(Object.entries(REPOSITORY_MESSAGES))('%s asserts no absence', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const claim of forbidden) expect(lowered).not.toContain(claim);
  });

  it('renders the empty state as "nothing here is visible to you"', async () => {
    const html = await render({ repositories: [] });
    expect(html).toContain(REPOSITORY_MESSAGES.empty);
  });

  it('makes no absence claim anywhere on an empty page', async () => {
    const html = (await render({ repositories: [] })).toLowerCase();
    for (const claim of forbidden) expect(html).not.toContain(claim);
  });

  it('does not describe an empty list as a failure', async () => {
    const html = (await render({ repositories: [] })).toLowerCase();
    for (const word of ['error', 'failed', 'unavailable']) expect(html).not.toContain(word);
  });
});

describe('SPEC-0052 AC10/AC12 — the list itself', () => {
  it('links each repository to its tree', async () => {
    const html = await render({});
    expect(html).toContain('href="/repos/acme%2Fweb/tree/main/"');
    expect(html).toContain('Web');
  });

  it('keeps the order the server returned', async () => {
    const html = await render({ repositories: [repo('z', 'Zed'), repo('a', 'Ay')] });
    expect(html.indexOf('Zed')).toBeLessThan(html.indexOf('Ay'));
  });

  it('renders no count, total or "of N"', async () => {
    const html = await render({ repositories: [repo('a', 'Ay'), repo('b', 'Bee')] });
    expect(html).not.toMatch(/\bof\s+\d+\b/);
    expect(html.toLowerCase()).not.toContain('total');
    expect(html.toLowerCase()).not.toContain('showing');
  });

  it('offers the next page as the opaque token, never a page number', async () => {
    const html = await render({ nextPageToken: 'opaque::42' });
    expect(html).toContain(encodeURIComponent('opaque::42'));
    expect(html.toLowerCase()).not.toContain('page 2');
  });

  it('offers no next page when the token is empty', async () => {
    const html = await render({ nextPageToken: '' });
    expect(html.toLowerCase()).not.toContain('more repositories');
  });
});
