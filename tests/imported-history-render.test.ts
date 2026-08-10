import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ImportedHistory from '../src/components/ImportedHistory.astro';
import {
  ANCHOR_FILE,
  CLASS_ATTESTED_IMPORT,
  type ImportedMergeRequestView,
} from '../src/lib/provenance';

function record(): ImportedMergeRequestView {
  const provenance = {
    class: CLASS_ATTESTED_IMPORT,
    import_id: 'import-1',
    source_system: 'github',
    source_instance: 'github.com',
    source_ref: 'https://github.com/acme/widget/pull/7',
    declared_actor: 'octocat',
    declared_at: '2019-04-02T09:30:00Z',
    payload_digest: 'sha256:abc',
  };
  return {
    merge_request_id: 'imported-7',
    source_ref: 'refs/heads/topic',
    target_ref: 'refs/heads/main',
    title: 'Old pull request',
    description: 'from GitHub',
    state: 'merged',
    declared_creator: 'octocat',
    provenance,
    threads: [
      {
        thread_id: 'thread-1',
        merge_request_id: 'imported-7',
        path: 'cmd/main.go',
        anchor: ANCHOR_FILE,
        approximate: true,
        provenance,
        comments: [
          {
            comment_id: 'comment-1',
            declared_actor: 'octocat',
            body: 'looks fine to me',
            declared_at: '2019-04-02T09:30:00Z',
            provenance,
          },
        ],
      },
    ],
    approvals: [
      {
        approval_id: 'approval-1',
        merge_request_id: 'imported-7',
        declared_actor: 'hubber',
        declared_at: '2019-04-02T09:30:00Z',
        provenance,
        satisfies_policy: false,
      },
    ],
  };
}

async function render(records: ImportedMergeRequestView[]): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ImportedHistory, { props: { records } });
}

// AC23 as the reader sees it: the rendered markup states that this history is
// not verified, that an imported approval satisfies no merge policy, and that a
// degraded anchor is approximate.
describe('imported history rendering', () => {
  it('labels the whole section as unverified imported history', async () => {
    const html = await render([record()]);
    expect(html).toContain('Imported history — not verified by this platform');
    expect(html).toContain('This platform did');
    expect(html).toContain('Imported from github.com');
  });

  it('never renders an imported approval as a platform approval', async () => {
    const html = await render([record()]);
    expect(html).toContain('Imported approval');
    expect(html).toContain('not a platform approval');
    expect(html).toContain('does not satisfy this merge policy');
    expect(html).not.toContain('Approved by hubber');
  });

  it('renders a foreign handle with its source instance and never as a user link', async () => {
    const html = await render([record()]);
    expect(html).toContain('octocat (on github.com)');
    expect(html).not.toMatch(/<a[^>]*octocat/);
  });

  it('marks a degraded anchor approximate', async () => {
    const html = await render([record()]);
    expect(html).toContain('Approximate location');
    expect(html).toContain('attached to the file');
  });

  it('renders nothing at all when there is no imported history', async () => {
    const html = await render([]);
    expect(html).not.toContain('Imported history');
  });
});
