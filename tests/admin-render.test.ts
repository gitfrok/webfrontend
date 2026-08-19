// T-0073 / SPEC-0058 AC12–AC18 — the fleet report and its age, the audit door, and
// the panels that must never appear.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FleetReport from '../src/components/FleetReport.astro';
import { ADMIN_MESSAGES, planeStatusKey, ageOf, contactLine } from '../src/lib/admin';
import { STATUS_VOCABULARY, describeStatus } from '../src/lib/status';
import type { PlaneView } from '../src/lib/bff';

const NOW = new Date('2026-08-19T12:00:00Z');

const plane = (overrides: Partial<PlaneView> = {}): PlaneView => ({
  data_plane_id: 'dp-1',
  status: 'CONNECTED',
  cloud: 'CLOUD_GKE',
  region: 'eu-west-1',
  agent_version: '1.4.0',
  k8s_version: '1.30',
  last_seen_at: '2026-08-19T11:58:00Z',
  enrolled_at: '2026-08-16T09:00:00Z',
  certificate_expires_at: '2026-08-20T09:00:00Z',
  token_id: '',
  ...overrides,
});

async function render(planes: PlaneView[] = [plane()]): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(FleetReport, { props: { planes, now: NOW } });
}

describe('SPEC-0058 AC12 — the report, with its age', () => {
  it('renders one row per plane with its state and when it last reported', async () => {
    const html = await render();
    expect(html).toContain('dp-1');
    expect(html).toContain('Connected');
    expect(html).toContain('last reported');
    expect(html).toContain('eu-west-1');
    expect(html).toContain('agent 1.4.0');
  });

  it('says a plane that has never connected has had no contact', async () => {
    // Not "a long time ago": a plane provisioned an hour ago and never seen is not
    // a plane that went quiet an hour ago, and an age would say it was.
    const html = await render([plane({ data_plane_id: '', status: 'NEVER_CONNECTED', last_seen_at: '', token_id: 'tok-9' })]);
    expect(html).toContain('no contact yet');
    expect(html).toContain('tok-9');
    expect(html).toContain('Never connected');
  });

  it('renders a stale plane as stale, never as connected', async () => {
    const html = await render([plane({ status: 'STALE', last_seen_at: '2026-08-15T12:00:00Z' })]);
    expect(html).toContain('Stale');
    expect(html).not.toContain('Connected');
    expect(html).toContain('4d ago');
  });

  it('renders an unfamiliar state as unknown rather than as the nearest familiar one', async () => {
    const html = await render([plane({ status: 'DRAINING' })]);
    expect(html).toContain('Unknown state');
    expect(html).not.toContain('Connected');
  });
});

describe('SPEC-0058 AC13 — the report says it is a report', () => {
  it('states that this is what each plane last said, not a live view', async () => {
    const html = await render();
    expect(html).toContain(ADMIN_MESSAGES.reportIsAReport);
    expect(html).toContain('connects outbound');
  });

  it('never claims to be live', async () => {
    const html = (await render()).toLowerCase();
    // The word "live" does appear — in "not a live view", which is the claim being
    // denied. What must not appear is any affirmative liveness, so the assertion is
    // about the phrasings that assert it rather than about the word.
    expect(html).toContain('not a live view');
    for (const phrase of ['real-time', 'realtime', 'currently running', 'right now', 'live status', 'is live']) {
      expect(html).not.toContain(phrase);
    }
  });
});

describe('SPEC-0058 AC14 — what the page cannot show', () => {
  it('says the runners inside a plane are not visible from here', async () => {
    const html = await render();
    expect(html).toContain(ADMIN_MESSAGES.noRunnerConsole);
  });

  it('carries no per-person activity, and no members or roles table', async () => {
    const html = (await render()).toLowerCase();
    for (const phrase of ['last active', 'last seen by', 'members</th>', 'roles</th>']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('never implies a panel is pending', async () => {
    const html = (await render()).toLowerCase();
    for (const phrase of ['coming soon', 'not yet available', 'upcoming', 'planned', 'in progress']) {
      expect(html).not.toContain(phrase);
    }
  });
});

describe('SPEC-0058 AC15 — the audit section is a door, not a browser', () => {
  it('explains that audit access is a scoped, time-boxed, revocable grant', async () => {
    const html = await render();
    expect(html).toContain(ADMIN_MESSAGES.auditIsAGrant);
    expect(html).toContain('/compliance/auditor-grants');
    expect(html).toContain('/compliance/evidence-packs');
  });

  it('renders no audit record and no trail table', async () => {
    const html = (await render()).toLowerCase();
    // The panel talks ABOUT audit access; what it must not contain is a rendering
    // of the trail itself, or a control that would fetch one.
    for (const phrase of ['audit log</h2>', 'audit trail</h2>', 'name="audit', 'audit_records', '/v1/audit']) {
      expect(html).not.toContain(phrase);
    }
  });
});

describe('SPEC-0058 AC16/AC17 — absences and the two empty readings', () => {
  it('says why members and roles are absent instead of showing an empty table', async () => {
    const html = await render();
    expect(html).toContain(ADMIN_MESSAGES.noMembers);
  });

  it('has no disabled control anywhere', async () => {
    const html = await render();
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('aria-disabled');
  });

  it('says an empty fleet is an answer from the control plane', async () => {
    // The other reading — the report being unavailable — is the page's, not this
    // component's, and the two sentences are deliberately different.
    const html = await render([]);
    expect(html).toContain(ADMIN_MESSAGES.emptyFleet);
    expect(html).not.toContain(ADMIN_MESSAGES.unavailable);
  });
});

describe('SPEC-0058 AC18 — the design-system gates', () => {
  it('uses no hex literal', async () => {
    const html = await render([plane(), plane({ data_plane_id: 'dp-2', status: 'STALE' })]);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('gives every plane state a glyph and a word', () => {
    for (const key of ['PLANE_CONNECTED', 'PLANE_STALE', 'PLANE_REVOKED', 'PLANE_NEVER_CONNECTED', 'PLANE_UNKNOWN'] as const) {
      expect(STATUS_VOCABULARY[key].glyph).not.toBe('');
      expect(STATUS_VOCABULARY[key].label).not.toBe('');
    }
  });

  it('separates connected from stale without colour', () => {
    // The pair an operator is actually scanning for. Same glyph or same word would
    // make the row that stopped answering findable only by hue.
    const connected = describeStatus('PLANE_CONNECTED').descriptor;
    const stale = describeStatus('PLANE_STALE').descriptor;
    expect(connected.glyph).not.toBe(stale.glyph);
    expect(connected.label).not.toBe(stale.label);
    expect(connected.tone).not.toBe(stale.tone);
  });

  it('prints each badge glyph once', async () => {
    const html = await render();
    const badge = html.slice(html.indexOf('gf-status gf-status-success'));
    expect(badge).not.toContain(`${STATUS_VOCABULARY.PLANE_CONNECTED.glyph} Connected`);
  });
});

describe('SPEC-0058 — the admin vocabulary', () => {
  it('maps each wire status onto its own key, and an unknown one onto unknown', () => {
    expect(planeStatusKey('CONNECTED')).toBe('PLANE_CONNECTED');
    expect(planeStatusKey('STALE')).toBe('PLANE_STALE');
    expect(planeStatusKey('REVOKED')).toBe('PLANE_REVOKED');
    expect(planeStatusKey('NEVER_CONNECTED')).toBe('PLANE_NEVER_CONNECTED');
    expect(planeStatusKey('SOMETHING_NEW')).toBe('PLANE_UNKNOWN');
    expect(planeStatusKey('')).toBe('PLANE_UNKNOWN');
  });

  it('has no age for a plane that has never reported', () => {
    expect(ageOf('', NOW)).toBeNull();
    expect(ageOf('not a date', NOW)).toBeNull();
    expect(contactLine('', NOW)).toBe('no contact yet');
  });

  it('renders an age in the coarsest unit that still says something', () => {
    expect(ageOf('2026-08-19T11:59:30Z', NOW)).toBe('30s ago');
    expect(ageOf('2026-08-19T11:00:00Z', NOW)).toBe('60m ago');
    expect(ageOf('2026-08-19T02:00:00Z', NOW)).toBe('10h ago');
    expect(ageOf('2026-08-14T12:00:00Z', NOW)).toBe('5d ago');
  });

  it('does not render a future instant as a negative age', () => {
    // A plane whose clock is ahead of ours is a real condition, and "-4s ago"
    // reads as a bug in this page rather than as a fact about the fleet.
    expect(ageOf('2026-08-19T12:00:04Z', NOW)).toBe('just now');
  });
});
