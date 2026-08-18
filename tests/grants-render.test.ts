// T-0052 / SPEC-0051 AC2, AC3, AC4, AC6, AC7, AC8 — what the grants surface says.
//
// AC4 is the one a careful developer gets wrong on purpose: an expired-looking
// grant is obvious from `expires_at`, and computing the state from it feels
// like helpfulness. It is not. The state is read at decision time by the
// server; a browser that computes it renders a grant expired while the server
// still honours it, or the reverse (SPEC-0033 AC7).
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import GrantList from '../src/components/GrantList.astro';
import IssueGrant from '../src/components/IssueGrant.astro';
import { GRANT_MESSAGES, describeGrantState, GRANT_STATES } from '../src/lib/grants';
import { STATUS_VOCABULARY, type StatusKey } from '../src/lib/status';
import type { AuditorGrantView } from '../src/lib/bff';

const grant = (overrides: Partial<AuditorGrantView> = {}): AuditorGrantView => ({
  grant_id: 'grant-1',
  tenant_id: 'tenant-1',
  auditor_principal_id: 'auditor@example.test',
  range_from: '2026-07-01T00:00:00Z',
  range_to: '2026-08-01T00:00:00Z',
  pack_ids: ['pack-1', 'pack-2'],
  expires_at: '2026-09-01T00:00:00Z',
  granted_by: 'admin@gitsaas.test',
  issued_at: '2026-08-18T00:00:00Z',
  state: 'ACTIVE',
  ...overrides,
});

async function renderList(grants: AuditorGrantView[]): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(GrantList, { props: { grants } });
}

describe('SPEC-0051 AC3 — the list renders scope, state and lifecycle', () => {
  it('renders the auditor, the range, the packs, the expiry and who granted it', async () => {
    const html = await renderList([grant()]);
    expect(html).toContain('auditor@example.test');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('pack-1');
    expect(html).toContain('pack-2');
    expect(html).toContain('admin@gitsaas.test');
  });

  it('renders a revocation time when the wire carried one', async () => {
    const html = await renderList([grant({ state: 'REVOKED', revoked_at: '2026-08-19T09:00:00Z' })]);
    expect(html).toContain('2026-08-19');
  });

  it('renders no pack contents — this surface administers access, never reads it', async () => {
    const html = (await renderList([grant()])).toLowerCase();
    for (const word of ['record_hash', 'chain_seq', 'records_digest', 'anchors']) {
      expect(html).not.toContain(word);
    }
  });

  it('says the list is empty rather than rendering nothing at all', async () => {
    const html = await renderList([]);
    expect(html).toContain(GRANT_MESSAGES.noGrants);
  });
});

describe('SPEC-0051 AC4 — state is never computed here', () => {
  it('renders a past-expiry grant as ACTIVE when the server says ACTIVE', async () => {
    const html = await renderList([grant({ expires_at: '2020-01-01T00:00:00Z', state: 'ACTIVE' })]);
    expect(html).toContain('Active');
    expect(html).not.toContain('Expired');
  });

  it('renders a future-expiry grant as EXPIRED when the server says EXPIRED', async () => {
    const html = await renderList([grant({ expires_at: '2099-01-01T00:00:00Z', state: 'EXPIRED' })]);
    expect(html).toContain('Expired');
    expect(html).not.toContain('Active');
  });

  it('renders a state this build does not know as unknown, not as a neutral badge', async () => {
    const html = await renderList([grant({ state: 'SUSPENDED' })]);
    expect(html.toLowerCase()).toContain('unknown');
  });
});

describe('SPEC-0051 AC8 — grant states are their own distinctness set', () => {
  it('carries exactly the three the contract names', () => {
    expect([...GRANT_STATES].sort()).toEqual(['ACTIVE', 'EXPIRED', 'REVOKED']);
  });

  it('shares no glyph and no word between any two', () => {
    const described = GRANT_STATES.map((s) => describeGrantState(s));
    expect(new Set(described.map((d) => d.glyph)).size).toBe(GRANT_STATES.length);
    expect(new Set(described.map((d) => d.label)).size).toBe(GRANT_STATES.length);
  });

  it('does not encode ACTIVE against REVOKED as the success/danger pair', async () => {
    const tones = [describeGrantState('ACTIVE').tone, describeGrantState('REVOKED').tone];
    expect(tones[0]).not.toBe(tones[1]);
    expect([...tones].sort()).not.toEqual(['gf-status-danger', 'gf-status-success']);
  });

  it('enters the one status vocabulary', () => {
    for (const key of GRANT_STATES) {
      expect(Object.keys(STATUS_VOCABULARY)).toContain(key as StatusKey);
    }
  });
});

describe('SPEC-0051 AC7 — no affordance is a permission claim', () => {
  it('offers revoke on every grant the server returned, disabling nothing', async () => {
    const html = await renderList([grant(), grant({ grant_id: 'grant-2' })]);
    expect(html.match(/Revoke/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/\bdisabled\b/);
    expect(html).not.toMatch(/aria-disabled/);
  });

  it('revokes through a POST relay, because a form cannot speak DELETE', async () => {
    const html = await renderList([grant()]);
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/compliance/auditor-grants/grant-1/revoke"');
  });

  it('makes no claim about what the reader may do', async () => {
    const html = (await renderList([grant()])).toLowerCase();
    for (const word of ['permission', 'not allowed', 'unauthorized', 'you cannot', 'you may not']) {
      expect(html).not.toContain(word);
    }
  });
});

describe('SPEC-0051 AC6 — a refusal names no cause', () => {
  const forbidden = [
    'permission', 'denied', 'not allowed', 'unauthorized', 'unauthorised',
    'forbidden', 'blocked by policy', 'does not exist', 'no such', 'not found',
  ];

  it.each(Object.entries(GRANT_MESSAGES))('%s asserts no cause', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const word of forbidden) expect(lowered).not.toContain(word);
  });
});

describe('SPEC-0051 AC1/AC2 — the issue form', () => {
  it('asks for every field the contract names and none it does not', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(IssueGrant, { props: {} });
    for (const field of ['auditor_principal_id', 'range_from', 'range_to', 'repository_id', 'pack_ids', 'expires_at']) {
      expect(html).toContain(`name="${field}"`);
    }
    for (const forbidden of ['name="state"', 'name="grant_id"', 'name="tenant_id"', 'name="granted_by"']) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('warns that the server may bound the requested expiry', async () => {
    // The admin has to know the date they type is a proposal, not a promise.
    const container = await AstroContainer.create();
    const html = await container.renderToString(IssueGrant, { props: {} });
    expect(html).toContain(GRANT_MESSAGES.expiryIsRequested);
  });
});
