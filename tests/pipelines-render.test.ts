// T-0061 / SPEC-0054 AC11, AC12 — the absence of logs is stated, not implied.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RunList from '../src/components/RunList.astro';
import { PIPELINE_MESSAGES, jobStateKey, triggerLabel } from '../src/lib/pipelines';
import { STATUS_VOCABULARY, describeStatus, type StatusKey } from '../src/lib/status';
import type { RunView } from '../src/lib/bff';

const run = (overrides: Partial<RunView> = {}): RunView => ({
  job_id: 'job-1', repository_id: 'repo-1', ref: 'refs/heads/main',
  commit_sha: 'abcdef1234567890', trigger: 'JOB_TRIGGER_KIND_REF_UPDATED',
  state: 'JOB_STATE_SUCCEEDED', queued_at: '2026-08-19T09:00:00Z',
  started_at: '2026-08-19T09:00:10Z', finished_at: '2026-08-19T09:02:00Z',
  outcome_summary: 'all green', ...overrides,
});

async function render(props: Record<string, unknown> = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(RunList, { props: { runs: [run()], nextHref: '', ...props } });
}

describe('SPEC-0054 AC11 — the missing logs are stated, not implied', () => {
  it('says job output is not kept, above the list', async () => {
    const html = await render();
    expect(html).toContain(PIPELINE_MESSAGES.noOutputRetained);
    expect(html.indexOf(PIPELINE_MESSAGES.noOutputRetained)).toBeLessThan(html.indexOf('<table'));
  });

  it.each(Object.entries(PIPELINE_MESSAGES))('%s promises nothing', (_key, message) => {
    const lowered = (message as string).toLowerCase();
    // "Coming soon" converts a decision nobody has taken into a promise
    // somebody made.
    for (const promise of ['coming soon', 'not yet available', 'in a future', 'will be added', 'temporarily']) {
      expect(lowered).not.toContain(promise);
    }
  });

  it('offers no log link, no log control and nothing to open', async () => {
    const html = (await render({ runs: [run({ state: 'JOB_STATE_FAILED' })] })).toLowerCase();
    for (const gesture of ['view log', 'logs', 'output', 'stdout', 'console', 'artifact', 'download']) {
      // The note itself says "output", so the check is on hrefs and controls.
      expect(html).not.toContain(`href="#${gesture}`);
    }
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/\bdisabled\b/);
  });

  it('says an empty list shows only what your access covers', async () => {
    const html = await render({ runs: [] });
    expect(html).toContain(PIPELINE_MESSAGES.empty);
  });

  it('never claims nothing has run', async () => {
    const html = (await render({ runs: [] })).toLowerCase();
    for (const claim of ['nothing has run', 'no runs have', 'there are none', 'never run']) {
      expect(html).not.toContain(claim);
    }
  });
});

describe('SPEC-0054 AC12 — job state carries glyph and word', () => {
  it('maps every wire state this build knows', () => {
    expect(jobStateKey('JOB_STATE_QUEUED')).toBe('QUEUED');
    expect(jobStateKey('JOB_STATE_RUNNING')).toBe('RUNNING_JOB');
    expect(jobStateKey('JOB_STATE_SUCCEEDED')).toBe('SUCCEEDED');
    expect(jobStateKey('JOB_STATE_FAILED')).toBe('FAILED_JOB');
    expect(jobStateKey('JOB_STATE_CANCELLED')).toBe('CANCELLED');
  });

  it('renders a state this build does not know as unknown, not as a neutral badge', async () => {
    const html = await render({ runs: [run({ state: 'JOB_STATE_SOMETHING_NEW' })] });
    expect(html.toLowerCase()).toContain('unknown');
  });

  it('gives every job state a glyph and a word', () => {
    for (const key of ['QUEUED', 'RUNNING_JOB', 'SUCCEEDED', 'FAILED_JOB', 'CANCELLED'] as StatusKey[]) {
      const d = STATUS_VOCABULARY[key];
      expect(d.glyph.length).toBeGreaterThan(0);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it('gives every job state a distinct glyph, because they share one column', () => {
    // Queued and cancelled share the muted tone. Without an override they
    // would share the hollow circle too, and a reader scanning this column
    // would be telling them apart by the word alone — which is exactly the
    // rule the grant list already holds.
    const keys = ['QUEUED', 'RUNNING_JOB', 'SUCCEEDED', 'FAILED_JOB', 'CANCELLED'] as StatusKey[];
    const glyphs = keys.map((k) => STATUS_VOCABULARY[k].glyph);
    expect(new Set(glyphs).size).toBe(keys.length);
  });

  it('does not encode succeeded against failed as the success/danger pair', () => {
    // A pipeline list is read by scanning a column of exactly these two, and
    // that pair is the one a deutan reader separates least well.
    const succeeded = describeStatus('SUCCEEDED').tone;
    const failed = describeStatus('FAILED_JOB').tone;
    expect(succeeded).not.toBe(failed);
    expect([succeeded, failed].sort()).not.toEqual(['gf-status-danger', 'gf-status-success']);
  });

  it('keeps the CI states distinct from the scan and pack vocabularies', () => {
    // RUNNING and FAILED already mean something else. One key meaning two
    // things is how a badge quietly renders the wrong word.
    expect(STATUS_VOCABULARY.RUNNING_JOB.label).toBe('Running');
    expect(STATUS_VOCABULARY.RUNNING).toBeDefined();
    expect(STATUS_VOCABULARY.FAILED_JOB.label).toBe('Failed');
    expect(STATUS_VOCABULARY.FAILED).toBeDefined();
  });
});

describe('SPEC-0054 AC10 — the run itself', () => {
  it('renders repository, ref, short commit, trigger and timings', async () => {
    const html = await render();
    expect(html).toContain('repo-1');
    expect(html).toContain('refs/heads/main');
    expect(html).toContain('abcdef1');
    expect(html).toContain('push');
    expect(html).toContain('2026-08-19 09:00');
  });

  it('renders an unfinished run with an em dash rather than an invented time', async () => {
    const html = await render({ runs: [run({ finished_at: '' })] });
    expect(html).toContain('—');
    expect(html).not.toContain('1970');
  });

  it('translates the trigger to a word', () => {
    expect(triggerLabel('JOB_TRIGGER_KIND_REF_UPDATED')).toBe('push');
    expect(triggerLabel('SOMETHING_ELSE')).toBe('unknown trigger');
  });

  it('offers older runs only when there is another page', async () => {
    expect(await render({ nextHref: '' })).not.toContain('Older runs');
    expect(await render({ nextHref: '/x' })).toContain('Older runs');
  });
});
