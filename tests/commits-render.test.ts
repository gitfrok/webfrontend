// T-0058 / SPEC-0053 AC11, AC12 — a git author is not a platform actor.
//
// Every previous honesty rule in this phase was about a refusal being mistaken
// for an absence. This one is about an identity being mistaken for an
// authenticated one, and it is the easiest to undo by accident: an avatar
// beside a name IS the assertion that the platform knows who that is.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CommitHistory from '../src/components/CommitHistory.astro';
import BlameView from '../src/components/BlameView.astro';
import { COMMIT_MESSAGES, shortCommit, commitDay } from '../src/lib/commits';
import type { CommitView, BlameRangeView } from '../src/lib/bff';

const identity = () => ({
  git_author_name: 'Ada', git_author_email: 'ada@example.test',
  git_committer_name: 'Grace', git_committer_email: 'grace@example.test',
  authored_at: '2026-08-19T00:00:00Z', committed_at: '2026-08-19T01:00:00Z',
});

const commit = (id: string, subject: string): CommitView => ({
  commit_id: id, identity: identity(), subject,
});

const range = (start: number, end: number): BlameRangeView => ({
  start_line: start, end_line: end, commit_id: 'abcdef1234567890', identity: identity(),
});

async function renderHistory(props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(CommitHistory, {
    props: { commits: [commit('abcdef1234567890', 'Add the thing')], nextHref: '', ...props },
  });
}

async function renderBlame(props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(BlameView, {
    props: { ranges: [range(1, 12)], capped: false, ...props },
  });
}

describe('SPEC-0053 AC11 — git identity is labelled as git identity', () => {
  it('says so on the history surface', async () => {
    expect(await renderHistory()).toContain(COMMIT_MESSAGES.gitIdentityNote);
  });

  it('says so on the blame surface', async () => {
    expect(await renderBlame()).toContain(COMMIT_MESSAGES.gitIdentityNote);
  });

  it('labels the name at the point of use, not only in the note', async () => {
    // A reader who scrolls past the note still needs to know what the name is.
    expect(await renderHistory()).toContain('git author');
    expect(await renderBlame()).toContain('Git author');
  });

  it.each(Object.entries(COMMIT_MESSAGES))('%s claims no platform identity', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const claim of ['signed in as', 'account holder', 'this user', 'the member', 'verified by']) {
      expect(lowered).not.toContain(claim);
    }
  });

  it('renders no avatar, no profile link and nothing implying a principal', async () => {
    for (const html of [await renderHistory(), await renderBlame()]) {
      expect(html).not.toContain('<img');
      expect(html).not.toContain('avatar');
      expect(html).not.toMatch(/href="\/(users|people|members|profile)/);
      expect(html.toLowerCase()).not.toContain('gravatar');
    }
  });

  it('never calls a git author an account, a member or a user', async () => {
    for (const html of [await renderHistory(), await renderBlame()]) {
      const lowered = html.toLowerCase();
      for (const word of ['account', 'member', 'signed in', 'profile']) {
        expect(lowered).not.toContain(word);
      }
    }
  });
});

describe('SPEC-0053 AC12 — a capped blame says so', () => {
  it('renders the partial notice when capped', async () => {
    const html = await renderBlame({ capped: true });
    expect(html).toContain(COMMIT_MESSAGES.blameCapped);
    expect(html).toContain('Partial');
  });

  it('renders no notice when the attribution is whole', async () => {
    expect(await renderBlame({ capped: false })).not.toContain(COMMIT_MESSAGES.blameCapped);
  });

  it('does not present the missing part as unattributed', async () => {
    // "unattributed" would imply we looked and found nothing. We did not look.
    const html = (await renderBlame({ capped: true })).toLowerCase();
    expect(html).not.toContain('unattributed');
    expect(html).not.toContain('unknown author');
  });
});

describe('SPEC-0053 — commit rendering', () => {
  it('shortens a commit id for reading but keeps the full value in the markup', async () => {
    const html = await renderHistory();
    expect(html).toContain(shortCommit('abcdef1234567890'));
    expect(html).toContain('title="abcdef1234567890"');
  });

  it('shows the authored day rather than a relative phrasing', async () => {
    // "3 days ago" is computed against the reader's clock and drifts with it.
    const html = await renderHistory();
    expect(html).toContain('2026-08-19');
    expect(html.toLowerCase()).not.toContain('ago');
  });

  it('collapses a single-line range to one number', async () => {
    const html = await renderBlame({ ranges: [range(7, 7)] });
    expect(html).not.toContain('7–7');
  });

  it('renders a multi-line range as a span', async () => {
    expect(await renderBlame({ ranges: [range(1, 12)] })).toContain('1–12');
  });

  it('offers older commits only when there is another page', async () => {
    expect(await renderHistory({ nextHref: '' })).not.toContain('Older commits');
    expect(await renderHistory({ nextHref: '/x' })).toContain('Older commits');
  });

  it('renders an empty day for an absent timestamp rather than inventing one', () => {
    expect(commitDay('')).toBe('');
  });
});
