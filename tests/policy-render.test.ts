// T-0063 / SPEC-0055 AC6, AC7, AC8 — the missing authoring must not read as a
// missing permission.
//
// This is the sharpest wording problem in the phase. Authoring is absent
// because ADR-0073 defers deciding what a tenant-authored policy even is — not
// because the reader lacks a role. From the outside those are
// indistinguishable, and every instinct of UI writing pushes toward the wrong
// one: a greyed-out button, "contact your administrator", "coming soon". Each
// tells the reader to go and ask someone, and there is nobody to ask.
import { describe, it, expect } from 'vitest';
import { POLICY_MESSAGES, modeLabel } from '../src/lib/policy';
import { STATUS_VOCABULARY, describeStatus } from '../src/lib/status';

describe('SPEC-0055 AC6 — the absence is stated accurately', () => {
  const forbidden = [
    'coming soon', 'not yet supported', 'not yet available', 'in a future release',
    'contact your administrator', 'ask your administrator', 'you do not have permission',
    'insufficient permissions', 'upgrade', 'request access',
  ];

  it.each(Object.entries(POLICY_MESSAGES))('%s sends the reader nowhere to ask', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const claim of forbidden) expect(lowered).not.toContain(claim);
  });

  it('says where policy IS authored rather than only that it is not here', async () => {
    // "Not here" alone leaves a reader hunting. The message names the place.
    expect(POLICY_MESSAGES.authoredInGovernance.toLowerCase()).toContain('governance repository');
  });

  it('says explicitly that nothing is waiting on a permission', () => {
    expect(POLICY_MESSAGES.authoredInGovernance.toLowerCase()).toContain('permission you do not have');
  });

  it('never describes the bundle read as a statement about existence', () => {
    expect(POLICY_MESSAGES.decisionUnavailable.toLowerCase()).toContain('nothing here says whether it exists');
  });
});

describe('SPEC-0055 AC8 — allow and deny are not a green/red pair', () => {
  it('renders both with glyph and word', () => {
    for (const key of ['ALLOWED', 'DENIED'] as const) {
      expect(STATUS_VOCABULARY[key].glyph.length).toBeGreaterThan(0);
      expect(STATUS_VOCABULARY[key].label.length).toBeGreaterThan(0);
    }
  });

  it('does not pair success against danger', () => {
    // This is the pair a reader most expects in green and red, and therefore
    // the one most worth refusing to render that way.
    const allowed = describeStatus('ALLOWED').tone;
    const denied = describeStatus('DENIED').tone;
    expect(allowed).not.toBe(denied);
    expect([allowed, denied].sort()).not.toEqual(['gf-status-danger', 'gf-status-success']);
  });

  it('does not render a denial as a failure', () => {
    // Deny-by-default means most denials are the system working.
    expect(describeStatus('DENIED').tone).not.toBe('gf-status-danger');
  });

  it('gives allowed and denied distinct glyphs', () => {
    expect(STATUS_VOCABULARY.ALLOWED.glyph).not.toBe(STATUS_VOCABULARY.DENIED.glyph);
  });
});

describe('SPEC-0055 — the evaluation mode', () => {
  it('says a dry run decided nothing', () => {
    // A dry-run decision enforced nothing, and rendering it identically to an
    // enforced one would misrepresent what happened.
    expect(modeLabel('EVALUATION_MODE_DRY_RUN')).toContain('decided nothing');
  });

  it('names an enforced decision as enforced', () => {
    expect(modeLabel('EVALUATION_MODE_ENFORCE')).toBe('enforced');
  });

  it('renders a mode this build does not know as unknown', () => {
    expect(modeLabel('EVALUATION_MODE_SOMETHING')).toBe('unknown mode');
  });
});
