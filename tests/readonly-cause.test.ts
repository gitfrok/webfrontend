// T-0044 / SPEC-0046 AC4 + AC5 (T-0044 task: "the regression pins cover the
// states this task labels"): the read-only cause distinction as the browser
// consumes it — durability vs throttle vs never, a bare "read-only" is not
// renderable, and commercial envelope states never become read-only.
import { describe, it, expect } from 'vitest';
import {
  describeReadOnly,
  readOnlyFromEnvelopeState,
  type ReadOnlyState,
} from '../src/lib/readonlyCause';

describe('SPEC-0046 AC4 read-only cause distinction', () => {
  it('renders the durability cause with its own prose — dual loss, audited override, reads still work', () => {
    const described = describeReadOnly({ readonly: true, cause: 'durability_mode' });
    expect(described).not.toBeNull();
    expect(described!.label).toContain('durability');
    expect(described!.detail).toContain('audited override');
    expect(described!.detail).toContain('Reads keep working');
  });

  it('renders the throttle cause as a DIFFERENT distinction, never the durability prose', () => {
    const described = describeReadOnly({ readonly: true, cause: 'envelope_throttle' });
    expect(described).not.toBeNull();
    expect(described!.label).toContain('throttle');
    expect(described!.label).not.toContain('durability');
    expect(described!.detail).toContain('git fetch keep working');
  });

  it('never renders a bare read-only: an absent or unknown cause yields no label', () => {
    const bare: ReadOnlyState = { readonly: true };
    expect(describeReadOnly(bare)).toBeNull();
    expect(describeReadOnly({ readonly: true, cause: 'commercial' as never })).toBeNull();
    expect(describeReadOnly(undefined)).toBeNull();
  });

  it('renders nothing for a writable condition', () => {
    expect(describeReadOnly({ readonly: false })).toBeNull();
    expect(describeReadOnly({ readonly: false, cause: 'durability_mode' })).toBeNull();
  });
});

describe('SPEC-0046 AC4/AC5 commercial prohibition (build-blocking pin)', () => {
  // PIN: no commercial envelope state — WITHIN, NEAR, EXCEEDED — may ever
  // become a read-only condition (SPEC-0041 AC8). This pin is wired into
  // 'npm run build' via prebuild.
  it('PIN never-read-only-from-commercial-state: envelope states stay writable conditions', () => {
    for (const state of ['WITHIN', 'NEAR', 'EXCEEDED', undefined, '']) {
      const condition = readOnlyFromEnvelopeState(state);
      expect(condition.readonly, `envelope state ${state} rendered read-only`).toBe(false);
      expect(condition.cause, `envelope state ${state} named a read-only cause`).toBeUndefined();
      expect(describeReadOnly(condition), `envelope state ${state} rendered a read-only label`).toBeNull();
    }
  });
});
