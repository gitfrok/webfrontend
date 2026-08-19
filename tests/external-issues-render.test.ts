// T-0076 / SPEC-0059 AC14–AC19 — what a reference shows, what the page refuses to
// imply, and the URL that never becomes a link.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ExternalIssues from '../src/components/ExternalIssues.astro';
import {
  EXTERNAL_ISSUE_MESSAGES,
  externalIssueMessageForKey,
  isSafeIssueURL,
  issueHost,
} from '../src/lib/externalIssues';
import type { ExternalIssueView } from '../src/lib/bff';

const reference = (overrides: Partial<ExternalIssueView> = {}): ExternalIssueView => ({
  tracker: 'JIRA',
  issue_key: 'PLAT-1421',
  url: 'https://tracker.example.test/browse/PLAT-1421',
  linked_by: 'dev@gitsaas.test',
  linked_at: '2026-08-19T09:00:00Z',
  ...overrides,
});

async function render(references: ExternalIssueView[] = [reference()]): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ExternalIssues, {
    props: { repositoryID: 'repo-1', mergeRequestID: 'mr-1', references },
  });
}

describe('SPEC-0059 AC14 — the reference, and where it goes', () => {
  it('shows the tracker, the key and the host the link points at', async () => {
    const html = await render();
    expect(html).toContain('JIRA');
    expect(html).toContain('PLAT-1421');
    expect(html).toContain('tracker.example.test');
    expect(html).toContain('href="https://tracker.example.test/browse/PLAT-1421"');
  });

  it('says who referenced it and when', async () => {
    const html = await render();
    expect(html).toContain('dev@gitsaas.test');
    expect(html).toContain('2026-08-19T09:00:00Z');
  });

  it('carries rel="noopener noreferrer" on a link out of the product', async () => {
    expect(await render()).toContain('rel="noopener noreferrer"');
  });
});

describe('SPEC-0059 AC15 — what a reference is not', () => {
  it('says this product stores no issue and knows no issue state', async () => {
    const html = await render();
    expect(html).toContain(EXTERNAL_ISSUE_MESSAGES.whatThisIs);
    expect(html).toContain('never asks the tracker anything');
  });

  it('says merging closes nothing', async () => {
    const html = await render();
    expect(html).toContain(EXTERNAL_ISSUE_MESSAGES.mergingClosesNothing);
  });

  it('shows no issue title, status or assignee, because it has none', async () => {
    const html = (await render()).toLowerCase();
    for (const phrase of ['issue title', 'issue status', 'assignee', 'labels:', 'open</span>', 'closed</span>']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('never implies the tracker is read or written', async () => {
    const html = (await render()).toLowerCase();
    for (const phrase of ['will close', 'auto-close', 'autoclose', 'synced', 'in sync', 'coming soon', 'not yet available']) {
      expect(html).not.toContain(phrase);
    }
  });
});

describe('SPEC-0059 AC16 — plain forms', () => {
  it('adds and removes with forms that need no script', async () => {
    const html = await render();
    expect(html).toContain('method="post"');
    expect(html).toContain('name="tracker"');
    expect(html).toContain('name="issue_key"');
    expect(html).toContain('name="url"');
    expect(html).toContain('/external_issues/unlink');
    expect(html).not.toContain('<script');
  });

  it('removes by identity, not by position', async () => {
    const html = await render([reference(), reference({ tracker: 'Linear', issue_key: 'ENG-9', url: 'https://linear.example.test/ENG-9' })]);
    expect(html).toContain('value="PLAT-1421"');
    expect(html).toContain('value="ENG-9"');
    expect(html).not.toContain('name="index"');
    expect(html).not.toContain('name="position"');
  });
});

describe('SPEC-0059 AC17 — a hostile URL never becomes a link', () => {
  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['plain http', 'http://tracker.example.test/PLAT-1'],
    ['relative', '/browse/PLAT-1'],
  ])('renders a %s URL as text', async (_name, url) => {
    const html = await render([reference({ url })]);
    // The key is still shown — the reference exists and hiding it would be a
    // different lie — but there is no href, and the page says why.
    expect(html).toContain('PLAT-1421');
    expect(html).not.toContain(`href="${url}"`);
    expect(html).toContain(EXTERNAL_ISSUE_MESSAGES.unsafeURL);
  });

  it('classifies URLs the same way the renderer does', () => {
    expect(isSafeIssueURL('https://tracker.example.test/x')).toBe(true);
    expect(isSafeIssueURL('http://tracker.example.test/x')).toBe(false);
    expect(isSafeIssueURL('javascript:alert(1)')).toBe(false);
    expect(isSafeIssueURL('/relative')).toBe(false);
    expect(isSafeIssueURL('')).toBe(false);
  });

  it('shows the host, and nothing when there is no host to show', () => {
    expect(issueHost('https://tracker.example.test/browse/X')).toBe('tracker.example.test');
    expect(issueHost('not a url')).toBe('');
  });
});

describe('SPEC-0059 AC18/AC19 — the empty state and the gates', () => {
  it('says a merge request references nothing, and how one is added', async () => {
    const html = await render([]);
    expect(html).toContain(EXTERNAL_ISSUE_MESSAGES.empty);
    expect(html).toContain('name="tracker"');
  });

  it('uses no hex literal', async () => {
    expect(await render()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('escapes markup in a tracker label and an issue key', async () => {
    const html = await render([reference({ tracker: '<img src=x>', issue_key: '"onfocus="alert(1)' })]);
    // Two contexts, two escapes. In a text node the angle brackets are what matter;
    // in an attribute value the quote is — a `<` inside a quoted attribute is inert,
    // and asserting against it would be asserting against correct output.
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('value="&quot;onfocus=&quot;alert(1)"');
    expect(html).not.toContain('onfocus="alert(1)"');
  });
});

describe('SPEC-0059 — the outcome vocabulary', () => {
  it('refuses an outcome key it does not know', () => {
    expect(externalIssueMessageForKey('linked')).toBe(EXTERNAL_ISSUE_MESSAGES.linked);
    expect(externalIssueMessageForKey('invalid')).toBe(EXTERNAL_ISSUE_MESSAGES.invalid);
    expect(externalIssueMessageForKey('toString')).toBeNull();
    expect(externalIssueMessageForKey(null)).toBeNull();
  });

  it('has a distinct sentence for each refusal', () => {
    const { invalid, full, refused } = EXTERNAL_ISSUE_MESSAGES;
    expect(new Set([invalid, full, refused]).size).toBe(3);
  });
});
