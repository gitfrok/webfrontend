// T-0066 / SPEC-0056 AC11, AC12, AC14 — the moved tag, the absent artifacts,
// and prose that is displayed rather than executed.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ReleaseList from '../src/components/ReleaseList.astro';
import { RELEASE_MESSAGES, tagAgreement, agreementStatusKey } from '../src/lib/releases';
import { STATUS_VOCABULARY, describeStatus } from '../src/lib/status';
import type { ReleaseView, TagView } from '../src/lib/bff';

const release = (overrides: Partial<ReleaseView> = {}): ReleaseView => ({
  tag: 'v1.0.0', published_commit: 'then1111111111', notes: 'what changed',
  published_by: 'dev@gitsaas.test', published_at: '2026-08-19T09:00:00Z',
  notes_updated_at: '', ...overrides,
});

const tag = (name: string, commit: string): TagView => ({ name, commit_id: commit });

async function render(props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ReleaseList, {
    props: {
      repositoryID: 'repo-1',
      releases: [release()],
      tags: [tag('v1.0.0', 'then1111111111')],
      nextHref: '',
      ...props,
    },
  });
}

describe('SPEC-0056 AC11 — a release whose tag moved says so', () => {
  it('says nothing when the tag still points where it did', async () => {
    const html = await render();
    expect(html).not.toContain(RELEASE_MESSAGES.tagMoved);
    expect(html).not.toContain(RELEASE_MESSAGES.tagGone);
    expect(html).not.toContain('Tag moved');
  });

  it('says the tag moved when it points somewhere else now', async () => {
    const html = await render({ tags: [tag('v1.0.0', 'now9999999999')] });
    expect(html).toContain(RELEASE_MESSAGES.tagMoved);
    expect(html).toContain('Tag moved');
  });

  it('says the tag is gone when it no longer exists', async () => {
    const html = await render({ tags: [] });
    expect(html).toContain(RELEASE_MESSAGES.tagGone);
    expect(html).toContain('Tag gone');
  });

  it('keeps "moved" and "gone" apart — they are different things that happened', () => {
    expect(tagAgreement('abc', 'abc')).toBe('agrees');
    expect(tagAgreement('abc', 'def')).toBe('moved');
    expect(tagAgreement('abc', undefined)).toBe('gone');
    expect(agreementStatusKey('moved')).not.toBe(agreementStatusKey('gone'));
    // Agreement is the unremarkable case and renders no badge at all.
    expect(agreementStatusKey('agrees')).toBeNull();
  });

  it('shows the RECORDED commit, not the tag current target', async () => {
    const html = await render({ tags: [tag('v1.0.0', 'now9999999999')] });
    expect(html).toContain('then111');
    expect(html).not.toContain('now9999');
  });

  it('does not render a moved or missing tag as a failure', () => {
    // A maintainer moving a tag is a thing maintainers do; the release is still
    // an accurate record of what it was published against.
    expect(describeStatus('TAG_MOVED').tone).not.toBe('gf-status-danger');
    expect(describeStatus('TAG_GONE').tone).not.toBe('gf-status-danger');
    expect(STATUS_VOCABULARY.TAG_MOVED.glyph).not.toBe(STATUS_VOCABULARY.TAG_GONE.glyph);
  });
});

describe('SPEC-0056 AC12 — the absence of artifacts is stated', () => {
  it('says no files are stored', async () => {
    expect(await render()).toContain(RELEASE_MESSAGES.noArtifacts);
  });

  it.each(Object.entries(RELEASE_MESSAGES))('%s promises no upload', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const promise of ['coming soon', 'not yet', 'will be able', 'in a future', 'upload']) {
      expect(lowered).not.toContain(promise);
    }
  });

  it('offers nothing to download and nothing to attach', async () => {
    const html = (await render()).toLowerCase();
    for (const gesture of ['download', 'attach', 'upload', 'artifact', 'asset']) {
      expect(html).not.toContain(`>${gesture}`);
    }
    expect(html).not.toContain('type="file"');
  });
});

describe('SPEC-0056 AC14 — notes are displayed, not executed', () => {
  it('escapes markup in a release note', async () => {
    const hostile = '<script>alert(1)</script> and <img src=x onerror=alert(2)>';
    const html = await render({ releases: [release({ notes: hostile })] });
    // The text is present and the TAGS are inert. Asserting on the attribute
    // text alone would fail wrongly: `onerror=alert(2)` legitimately survives
    // inside `&lt;img src=x onerror=alert(2)&gt;`, where it is prose. What
    // makes it harmless is that the angle brackets are escaped, so nothing
    // here is an element.
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });

  it('preserves the shape of multi-line notes without interpreting them', async () => {
    const html = await render({ releases: [release({ notes: 'line one\nline two' })] });
    expect(html).toContain('line one');
    expect(html).toContain('white-space:pre-wrap');
  });
});

describe('SPEC-0056 — the record itself', () => {
  it('renders who published and when', async () => {
    const html = await render();
    expect(html).toContain('dev@gitsaas.test');
    expect(html).toContain('2026-08-19');
  });

  it('mentions an edit only once one has happened', async () => {
    expect(await render()).not.toContain('notes edited');
    const edited = await render({ releases: [release({ notes_updated_at: '2026-08-20T10:00:00Z' })] });
    expect(edited).toContain('notes edited');
    expect(edited).toContain('2026-08-20');
  });

  it('says an empty list shows only what your access covers', async () => {
    const html = await render({ releases: [] });
    expect(html).toContain(RELEASE_MESSAGES.empty);
  });

  it('never claims nothing has been published', async () => {
    const html = (await render({ releases: [] })).toLowerCase();
    for (const claim of ['no releases have', 'nothing has been published', 'there are none']) {
      expect(html).not.toContain(claim);
    }
  });
});
