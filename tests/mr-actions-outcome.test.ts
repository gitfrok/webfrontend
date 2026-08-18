// T-0049 / SPEC-0048 AC4–AC8 — what the surface is allowed to SAY, and how a
// disposition is told apart.
//
// AC4 is an enumeration for the same reason the status vocabulary is one: a
// test that checked the merge failure's copy would pass forever while someone
// writes "you do not have permission" into the review path. The BFF returns
// one coarse 404 for a dead session, an unknown repository, a policy refusal,
// a stale version and a gate rejection alike — so every one of those words is
// a claim this layer cannot support.
import { describe, it, expect } from 'vitest';
import {
  MR_ACTION_MESSAGES,
  classifyWriteOutcome,
  MR_DISPOSITIONS,
  describeDisposition,
  type MRDisposition,
} from '../src/lib/mrAction';
import { STATUS_VOCABULARY, type StatusKey } from '../src/lib/status';

const view = (version: number) => ({
  merge_request_id: 'mr1',
  repository_id: 'repo1',
  source_ref: 'feature',
  target_ref: 'main',
  title: 'Add the thing',
  description: '',
  creator_id: 'dev@gitsaas.test',
  state: 'OPEN',
  head_revision: 'abcdef1234567890',
  version,
  created_at: '2026-08-18T00:00:00Z',
});

describe('SPEC-0048 AC4 — a refusal names no cause', () => {
  // Each of these would be a statement about authorization, existence or
  // policy. The response that reaches this layer supports none of them.
  const forbidden = [
    'permission', 'denied', 'not allowed', 'unauthorized', 'unauthorised',
    'forbidden', 'blocked by policy', 'does not exist', 'no such', 'not found',
    'you cannot', 'you may not', 'insufficient',
  ];

  it('enumerates every string this surface can render', () => {
    // The guard is the enumeration itself: a message added outside this table
    // is a message no test has read.
    const values = Object.values(MR_ACTION_MESSAGES);
    expect(values.length).toBeGreaterThan(0);
    for (const message of values) {
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(MR_ACTION_MESSAGES))('%s asserts no cause it was not told', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    for (const word of forbidden) {
      expect(lowered).not.toContain(word);
    }
  });

  it('says the action did not take effect, which is the only thing it knows', () => {
    const outcome = classifyWriteOutcome({ submittedVersion: 3, reread: view(3) });
    expect(outcome.kind).toBe('not-applied');
    expect(outcome.message).toBe(MR_ACTION_MESSAGES.notApplied);
    expect(outcome.message.toLowerCase()).toContain('did not take effect');
  });
});

describe('SPEC-0048 AC5 — staleness is reported as staleness', () => {
  it('reads a higher current version as "this changed since you loaded it"', () => {
    const outcome = classifyWriteOutcome({ submittedVersion: 3, reread: view(5) });
    expect(outcome.kind).toBe('stale');
    expect(outcome.message).toBe(MR_ACTION_MESSAGES.stale);
    expect(outcome.current?.version).toBe(5);
  });

  it('reads an equal version as "did not take effect", never as staleness', () => {
    expect(classifyWriteOutcome({ submittedVersion: 4, reread: view(4) }).kind).toBe('not-applied');
  });

  it('does not invent staleness when the re-read itself failed', () => {
    // A failed re-read is not evidence the MR changed. Claiming staleness here
    // would be the same class of unsupported claim AC4 forbids.
    const outcome = classifyWriteOutcome({ submittedVersion: 3, reread: null });
    expect(outcome.kind).toBe('not-applied');
    expect(outcome.current).toBeNull();
  });

  it('treats a lower current version as not-applied rather than as anything clever', () => {
    // Versions do not go backwards; if one appears to, the honest reading is
    // that we do not know what happened.
    expect(classifyWriteOutcome({ submittedVersion: 5, reread: view(3) }).kind).toBe('not-applied');
  });
});

describe('SPEC-0048 AC7/AC8 — dispositions are told apart without colour', () => {
  it('carries all three dispositions the contract defines', () => {
    expect(Object.keys(MR_DISPOSITIONS).sort()).toEqual(['APPROVE', 'COMMENT', 'REQUEST_CHANGES']);
  });

  it('gives every disposition a glyph and a word, not only a tone', () => {
    for (const key of Object.keys(MR_DISPOSITIONS) as MRDisposition[]) {
      const d = describeDisposition(key);
      expect(d.glyph.length).toBeGreaterThan(0);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.tone).toMatch(/^gf-status-(success|danger|warn|info|pending)$/);
    }
  });

  it('shares no glyph and no label between any two dispositions', () => {
    const keys = Object.keys(MR_DISPOSITIONS) as MRDisposition[];
    const glyphs = keys.map((k) => describeDisposition(k).glyph);
    const labels = keys.map((k) => describeDisposition(k).label);
    expect(new Set(glyphs).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(keys.length);
  });

  it('is not the success/danger pair the diff view already refuses', () => {
    const approve = describeDisposition('APPROVE').tone;
    const changes = describeDisposition('REQUEST_CHANGES').tone;
    expect(approve).not.toBe(changes);
    expect([approve, changes].sort()).not.toEqual(['gf-status-danger', 'gf-status-success']);
  });

  it('enters the one status vocabulary, so the existing enumeration covers it', () => {
    for (const key of ['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED'] as StatusKey[]) {
      expect(Object.keys(STATUS_VOCABULARY)).toContain(key);
    }
  });
});
