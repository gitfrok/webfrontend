// T-0070 / SPEC-0057 AC15–AC19 — what the settings surface shows, what it says
// about archival, and the four things it must never grow.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RepositorySettings from '../src/components/RepositorySettings.astro';
import {
  SETTINGS_MESSAGES,
  isArchived,
  archivalStatusKey,
  archivalMeaning,
  settingsMessageForKey,
} from '../src/lib/settings';
import { STATUS_VOCABULARY, describeStatus } from '../src/lib/status';
import type { SettingsView } from '../src/lib/bff';

const settings = (overrides: Partial<SettingsView> = {}): SettingsView => ({
  repository_id: 'repo-1',
  name: 'infra',
  description: 'the cluster',
  archived_at: '',
  settings_updated_at: '2026-08-19T09:30:00Z',
  settings_updated_by: 'owner@gitsaas.test',
  ...overrides,
});

async function render(overrides: Partial<SettingsView> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(RepositorySettings, {
    props: { repositoryID: 'repo-1', settings: settings(overrides) },
  });
}

describe('SPEC-0057 AC15 — the three settings, and who changed them', () => {
  it('shows the name and description in forms that need no script', async () => {
    const html = await render();
    expect(html).toContain('name="name"');
    expect(html).toContain('value="infra"');
    expect(html).toContain('name="description"');
    expect(html).toContain('the cluster');
    expect(html).toContain('method="post"');
    // No client script anywhere on this surface: a settings page that needs
    // JavaScript to save a name is a settings page a reader cannot use.
    expect(html).not.toContain('<script');
  });

  it('states who last changed the settings and when', async () => {
    const html = await render();
    expect(html).toContain('owner@gitsaas.test');
    expect(html).toContain('2026-08-19T09:30:00Z');
  });

  it('says nothing about a change nobody has made', async () => {
    const html = await render({ settings_updated_at: '', settings_updated_by: '' });
    expect(html).not.toContain('Last changed by');
  });
});

describe('SPEC-0057 AC16 — the absences are stated, not implied', () => {
  it('says what is not a setting in this product', async () => {
    const html = await render();
    expect(html).toContain(SETTINGS_MESSAGES.notSettings);
    expect(html).toContain(SETTINGS_MESSAGES.noDeletion);
  });

  it('offers no control for anything ADR-0076 excluded', async () => {
    const html = await render();
    for (const field of [
      'name="visibility"', 'name="public"', 'name="private"',
      'name="members"', 'name="member"', 'name="role"',
      'name="branch_protection"', 'name="required_approvals"', 'name="merge_rule"',
    ]) {
      expect(html).not.toContain(field);
    }
  });

  it('has no disabled control anywhere', async () => {
    // A disabled control tells a reader they lack a permission. They do not:
    // the capability does not exist (SPEC-0055 AC7's rule).
    for (const archived of [false, true]) {
      const html = await render({ archived_at: archived ? '2026-08-19T09:30:00Z' : '' });
      expect(html).not.toContain('disabled');
      expect(html).not.toContain('aria-disabled');
    }
  });

  it('never implies a control is pending', async () => {
    const html = (await render()).toLowerCase();
    for (const phrase of ['coming soon', 'not yet available', 'upcoming', 'planned', 'in progress', 'for now']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('offers no way to delete the repository', async () => {
    const html = (await render()).toLowerCase();
    expect(html).not.toContain('danger zone');
    expect(html).not.toContain('delete this');
    expect(html).not.toContain('/delete');
  });
});

describe('SPEC-0057 AC17 — an archived repository says what archival does', () => {
  it('labels an archived repository and says it is still readable and writable', async () => {
    const html = await render({ archived_at: '2026-08-19T09:30:00Z' });
    expect(html).toContain('Archived');
    expect(html).toContain(SETTINGS_MESSAGES.archivedMeaning);
    expect(html).toContain('still writable');
  });

  it('renders no read-only vocabulary for an archived repository', async () => {
    // The failure this forbids is a reader taking the label for a lock. If
    // archival ever does restrict writes it will be because someone decided
    // that, in an ADR, with a read-only cause behind it — and this test is what
    // they will have to change on purpose.
    const html = (await render({ archived_at: '2026-08-19T09:30:00Z' })).toLowerCase();
    for (const phrase of ['read-only', 'read only', 'locked', 'frozen', 'cannot be changed', 'no longer accepts']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('says what archiving would mean before it has happened', async () => {
    const html = await render();
    expect(html).toContain(SETTINGS_MESSAGES.activeMeaning);
    expect(html).toContain('Archive this repository');
  });

  it('asks for a state rather than a toggle, so a resubmission changes nothing', async () => {
    expect(await render()).toContain('name="archived" value="true"');
    expect(await render({ archived_at: '2026-08-19T09:30:00Z' })).toContain('name="archived" value="false"');
  });
});

describe('SPEC-0057 AC18 — a description is displayed, not executed', () => {
  it('escapes markup in a description', async () => {
    const html = await render({ description: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('cannot be broken out of the name attribute', async () => {
    // The name is rendered as an attribute value, where a quote — not a `<` — is
    // what escapes the context. A payload closing the attribute and adding an
    // event handler is the shape that would work, so that is the one asserted.
    const html = await render({ name: '" onfocus="alert(1)' });
    expect(html).toContain('value="&quot; onfocus=&quot;alert(1)"');
    expect(html).not.toContain('onfocus="alert(1)"');
  });
});

describe('SPEC-0057 AC19 — the design-system gates', () => {
  it('uses no hex literal', async () => {
    const html = await render({ archived_at: '2026-08-19T09:30:00Z' });
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('gives both archival states a glyph and a word', () => {
    for (const key of ['ARCHIVED', 'ACTIVE'] as const) {
      const descriptor = STATUS_VOCABULARY[key];
      expect(descriptor.glyph).not.toBe('');
      expect(descriptor.label).not.toBe('');
    }
  });

  it('separates archived from active without colour', () => {
    // Same-tone states would be indistinguishable in grayscale; same-glyph ones
    // indistinguishable to a screen reader's user reading labels aloud.
    const archived = describeStatus('ARCHIVED').descriptor;
    const active = describeStatus('ACTIVE').descriptor;
    expect(archived.glyph).not.toBe(active.glyph);
    expect(archived.label).not.toBe(active.label);
    expect(archived.tone).not.toBe(active.tone);
  });

  it('prints the glyph once', async () => {
    // The badge's glyph comes from the tone's ::before rule. Rendering it in the
    // markup as well printed it twice, which the capture review caught — so the
    // markup carries the word and the stylesheet carries the shape.
    const html = await render({ archived_at: '2026-08-19T09:30:00Z' });
    const badge = html.slice(html.indexOf('gf-status gf-status-info'));
    expect(badge).toContain('Archived');
    expect(badge).not.toContain(`${STATUS_VOCABULARY.ARCHIVED.glyph} Archived`);
  });
});

describe('SPEC-0057 — the settings vocabulary', () => {
  it('reads the archived state from the instant alone', () => {
    expect(isArchived('')).toBe(false);
    expect(isArchived(undefined)).toBe(false);
    expect(isArchived('2026-08-19T09:30:00Z')).toBe(true);
  });

  it('maps each state onto its own status key', () => {
    expect(archivalStatusKey('')).toBe('ACTIVE');
    expect(archivalStatusKey('2026-08-19T09:30:00Z')).toBe('ARCHIVED');
  });

  it('states a meaning for both states', () => {
    expect(archivalMeaning('')).toBe(SETTINGS_MESSAGES.activeMeaning);
    expect(archivalMeaning('2026-08-19T09:30:00Z')).toBe(SETTINGS_MESSAGES.archivedMeaning);
  });

  it('refuses an outcome key it does not know', () => {
    expect(settingsMessageForKey('saved')).toBe(SETTINGS_MESSAGES.saved);
    expect(settingsMessageForKey('toString')).toBeNull();
    expect(settingsMessageForKey('whatever-a-caller-appended')).toBeNull();
    expect(settingsMessageForKey(null)).toBeNull();
  });
});
