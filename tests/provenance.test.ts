import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CLASS_ATTESTED_IMPORT,
  CLASS_FIRST_PARTY,
  CLASS_UNSPECIFIED,
  ANCHOR_DIFF,
  ANCHOR_FILE,
  ANCHOR_MERGE,
  ANCHOR_UNSPECIFIED,
  anchorNote,
  approvalPresentation,
  countedApprovals,
  declaredActorLabel,
  declaredAtLabel,
  importedTimeline,
  isFirstParty,
  isImported,
  originLabel,
  type ImportedApprovalView,
  type ImportedMergeRequestView,
  type ImportedThreadView,
  type ProvenanceView,
} from '../src/lib/provenance';
import { importedHistory } from '../src/lib/bff';

function provenance(overrides: Partial<ProvenanceView> = {}): ProvenanceView {
  return {
    class: CLASS_ATTESTED_IMPORT,
    import_id: 'import-1',
    source_system: 'github',
    source_instance: 'github.com',
    source_ref: 'https://github.com/acme/widget/pull/7',
    declared_actor: 'octocat',
    declared_at: '2019-04-02T09:30:00Z',
    payload_digest: 'sha256:abc',
    ...overrides,
  };
}

function approval(overrides: Partial<ImportedApprovalView> = {}): ImportedApprovalView {
  return {
    approval_id: 'approval-1',
    merge_request_id: 'imported-7',
    declared_actor: 'hubber',
    declared_at: '2019-04-02T09:30:00Z',
    provenance: provenance(),
    satisfies_policy: false,
    ...overrides,
  };
}

function thread(overrides: Partial<ImportedThreadView> = {}): ImportedThreadView {
  return {
    thread_id: 'thread-1',
    merge_request_id: 'imported-7',
    path: 'cmd/main.go',
    anchor: ANCHOR_DIFF,
    approximate: false,
    provenance: provenance(),
    comments: [
      {
        comment_id: 'comment-1',
        declared_actor: 'octocat',
        body: 'looks fine to me',
        declared_at: '2019-04-02T09:30:00Z',
        provenance: provenance(),
      },
    ],
    ...overrides,
  };
}

// Only an explicit FIRST_PARTY class is platform history. Everything else — an
// import, an unreadable class, a missing block — renders as unverified, because
// the alternative is presenting unattested history as witnessed (ADR-0029 §1).
describe('provenance classification', () => {
  it('treats only an explicit first-party class as platform history', () => {
    expect(isFirstParty(provenance({ class: CLASS_FIRST_PARTY }))).toBe(true);
    expect(isFirstParty(provenance())).toBe(false);
    expect(isFirstParty(provenance({ class: CLASS_UNSPECIFIED }))).toBe(false);
    expect(isFirstParty(undefined)).toBe(false);
  });

  it('never falls through to first-party for a class it cannot name', () => {
    expect(isImported(provenance({ class: 'SOMETHING_A_LATER_BUILD_ADDED' }))).toBe(true);
    expect(isImported(provenance({ class: CLASS_UNSPECIFIED }))).toBe(true);
    expect(isImported(null)).toBe(true);
  });

  it('names the source instance in the badge, and says so when it has none', () => {
    expect(originLabel(provenance())).toBe('Imported from github.com');
    expect(originLabel(provenance({ source_instance: '', source_system: '' }))).toBe('Imported — source unknown');
    expect(originLabel(provenance({ class: CLASS_FIRST_PARTY }))).toBe('');
  });
});

// AC23's load-bearing rule: an imported approval is never presentable as a
// platform approval, and never counts toward a merge policy.
describe('imported approval rendering', () => {
  it('says in words that an imported approval is not a platform approval', () => {
    const presented = approvalPresentation(approval());
    expect(presented.counts).toBe(false);
    expect(presented.toneUnverified).toBe(true);
    expect(presented.label).toContain('Imported approval');
    expect(presented.label).toContain('not a platform approval');
    expect(presented.label).toContain('does not satisfy this merge policy');
    expect(presented.label).not.toMatch(/^Approved by/);
  });

  it('refuses to count an imported approval even if the payload claims it satisfies policy', () => {
    // A response asserting satisfies_policy on an ATTESTED_IMPORT record is
    // either a bug or a forgery. Either way the page must not honour it.
    const presented = approvalPresentation(approval({ satisfies_policy: true }));
    expect(presented.counts).toBe(false);
    expect(presented.toneUnverified).toBe(true);
  });

  it('never presents a declared actor as a resolvable platform user', () => {
    const presented = approvalPresentation(approval({ declared_actor: 'hubber' }));
    expect(presented.label).toContain('hubber (on github.com)');
  });

  it('keeps imported approvals out of the counted total', () => {
    const approvals = [
      approval(),
      approval({ approval_id: 'approval-2', satisfies_policy: true }),
      approval({
        approval_id: 'approval-3',
        provenance: provenance({ class: CLASS_FIRST_PARTY }),
        satisfies_policy: true,
      }),
    ];
    expect(countedApprovals(approvals)).toBe(1);
  });
});

// AC5: a degraded anchor is rendered as approximate, never as an exact position.
describe('anchor degradation rendering', () => {
  it('says nothing extra for a thread still anchored to a diff position', () => {
    expect(anchorNote(thread())).toBe('');
  });

  it('explains a file-level degradation', () => {
    const note = anchorNote(thread({ anchor: ANCHOR_FILE, approximate: true }));
    expect(note).toContain('Approximate location');
    expect(note).toContain('attached to the file');
  });

  it('explains an MR-level degradation', () => {
    const note = anchorNote(thread({ anchor: ANCHOR_MERGE, approximate: true, path: '' }));
    expect(note).toContain('Approximate location');
    expect(note).toContain('attached to the merge request');
  });

  it('marks an undeclared anchor approximate rather than exact', () => {
    const note = anchorNote(thread({ anchor: ANCHOR_UNSPECIFIED, approximate: true }));
    expect(note).toContain('Approximate location');
  });
});

describe('declared identity and dates', () => {
  it('always pairs a foreign handle with the instance it came from', () => {
    expect(declaredActorLabel(provenance(), 'octocat')).toBe('octocat (on github.com)');
    expect(declaredActorLabel(provenance({ declared_actor: '' }), '')).toContain('unidentified account');
  });

  it('renders an absent declared date as absent, never as the epoch', () => {
    expect(declaredAtLabel(null)).toBe('no date declared');
    expect(declaredAtLabel('')).toBe('no date declared');
    expect(declaredAtLabel('not-a-date')).toBe('no date declared');
    expect(declaredAtLabel('2019-04-02T09:30:00Z')).toBe('declared 2019-04-02');
  });
});

// Imported history is never folded into a first-party list untagged: each entry
// carries its own origin, so concatenating two arrays cannot lose the
// distinction.
describe('imported timeline', () => {
  function record(overrides: Partial<ImportedMergeRequestView> = {}): ImportedMergeRequestView {
    return {
      merge_request_id: 'imported-7',
      source_ref: 'refs/heads/topic',
      target_ref: 'refs/heads/main',
      title: 'Old pull request',
      description: 'from GitHub',
      state: 'merged',
      declared_creator: 'octocat',
      threads: [thread({ anchor: ANCHOR_FILE, approximate: true })],
      approvals: [approval()],
      provenance: provenance(),
      ...overrides,
    };
  }

  it('tags every entry as imported and carries the anchor note with it', () => {
    const entries = importedTimeline(record());
    expect(entries).toHaveLength(1);
    expect(entries[0].imported).toBe(true);
    expect(entries[0].author).toBe('octocat (on github.com)');
    expect(entries[0].note).toContain('Approximate location');
  });

  it('survives a record with no threads or comments', () => {
    expect(importedTimeline(record({ threads: [] }))).toHaveLength(0);
    expect(importedTimeline(record({ threads: [thread({ comments: [] })] }))).toHaveLength(0);
  });
});

// The client fetches imported history from the BFF only, with the session cookie
// forwarded, and classifies nothing itself.
describe('imported history client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the import history page from the BFF origin with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ merge_requests: [], next_page_token: 'page-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://app.gitsaas.test/repos/r1/merge_requests/mr-1', {
      headers: { cookie: '__Host-gitfrok_session=abc' },
    });
    const page = await importedHistory(request, 'r1', 'import-1', 'page-1');

    expect(page.next_page_token).toBe('page-2');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.href).toMatch(/\/v1\/repositories\/r1\/imports\/import-1\/history\?page_token=page-1$/);
    expect(init.headers.get('cookie')).toBe('__Host-gitfrok_session=abc');
  });

  it('treats a refusal as unavailable rather than as an import with no history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    const request = new Request('http://app.gitsaas.test/repos/r1/merge_requests/mr-1');
    await expect(importedHistory(request, 'r1', 'import-1')).rejects.toThrow('imported history unavailable');
  });
});
