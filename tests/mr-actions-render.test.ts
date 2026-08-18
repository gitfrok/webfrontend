// T-0049 / SPEC-0048 AC6, AC9 — what the controls render, and what they never
// render.
//
// AC6 is the criterion most likely to be undone by a well-meaning change: the
// obvious UX instinct is to hide the merge button from someone who cannot
// merge. This surface is never told who can merge. Hiding the control would
// therefore encode a guess, and a guess about authorization that renders as
// certainty is worse than a refusal.
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import MergeRequestActions from '../src/components/MergeRequestActions.astro';
import OpenMergeRequest from '../src/components/OpenMergeRequest.astro';
import ActionOutcome from '../src/components/ActionOutcome.astro';
import { MR_ACTION_MESSAGES } from '../src/lib/mrAction';
import type { MergeRequestView } from '../src/lib/bff';

const mr: MergeRequestView = {
  merge_request_id: 'mr-1',
  repository_id: 'acme/web',
  source_ref: 'feature',
  target_ref: 'main',
  title: 'Add the thing',
  description: 'it does the thing',
  creator_id: 'dev@gitsaas.test',
  state: 'OPEN',
  head_revision: 'abcdef1234567890',
  version: 7,
  created_at: '2026-08-18T00:00:00Z',
};

async function renderActions(view: MergeRequestView = mr): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(MergeRequestActions, { props: { mr: view } });
}

describe('SPEC-0048 AC6 — no affordance is a permission claim', () => {
  it('renders both the review and the merge control, unconditionally', async () => {
    // The component receives no roles, no session and no policy outcome —
    // there is nothing here it COULD condition on, and this test is what keeps
    // it that way.
    const html = await renderActions();
    expect(html).toContain('Submit review');
    expect(html).toContain('Merge into main');
  });

  it('disables nothing', async () => {
    const html = await renderActions();
    expect(html).not.toMatch(/\bdisabled\b/);
    expect(html).not.toMatch(/aria-disabled/);
  });

  it('makes no claim about what the reader may do', async () => {
    const html = (await renderActions()).toLowerCase();
    for (const word of ['permission', 'not allowed', 'unauthorized', 'you cannot', 'you may not']) {
      expect(html).not.toContain(word);
    }
  });

  it('renders no approval count, gate outcome or required-approvals number', async () => {
    // The MRView carries none of these. Rendering one would mean inventing it.
    const html = (await renderActions()).toLowerCase();
    // "required" alone would match the radio inputs' own attribute, so the
    // claims are matched as the phrases they would actually be written as.
    for (const claim of ['approval', 'approvals', 'approvals required', 'required approvals', 'merge gate', 'policy allows', 'checks passed']) {
      expect(html).not.toContain(claim);
    }
  });
});

describe('SPEC-0048 AC2/AC3 — the version travels from the rendered view', () => {
  it('carries the rendered version and head revision as hidden fields', async () => {
    const html = await renderActions();
    expect(html).toContain('name="expected_version" value="7"');
    expect(html).toContain('name="head_revision" value="abcdef1234567890"');
  });

  it('carries the version on the merge form too, not only on the review form', async () => {
    const html = await renderActions();
    const versions = html.match(/name="expected_version" value="7"/g) ?? [];
    expect(versions.length).toBe(2);
  });

  it('moves with the view rather than defaulting', async () => {
    const html = await renderActions({ ...mr, version: 0, head_revision: 'ff00aa11' });
    expect(html).toContain('name="expected_version" value="0"');
    expect(html).toContain('name="head_revision" value="ff00aa11"');
  });

  it('posts each form to its own SSR route, never to a BFF address', async () => {
    const html = await renderActions();
    expect(html).toContain('action="/api/repos/acme%2Fweb/merge_requests/mr-1/review"');
    expect(html).toContain('action="/api/repos/acme%2Fweb/merge_requests/mr-1/merge"');
    expect(html).not.toContain('http://bff');
  });
});

describe('SPEC-0048 AC7 — the dispositions render with glyph and word', () => {
  it('offers all three, each with its own glyph class', async () => {
    const html = await renderActions();
    expect(html).toContain('Approved');
    expect(html).toContain('Changes requested');
    expect(html).toContain('Commented');
    expect(html).toContain('gf-disposition-approve');
    expect(html).toContain('gf-disposition-request-changes');
    expect(html).toContain('gf-disposition-comment');
  });

  it('sends the disposition key, which the SSR route maps to the enum name', async () => {
    const html = await renderActions();
    expect(html).toContain('value="APPROVE"');
    expect(html).toContain('value="REQUEST_CHANGES"');
    expect(html).toContain('value="COMMENT"');
  });
});

describe('SPEC-0048 AC4/AC5 — the outcome note', () => {
  async function renderOutcome(key: string | null): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(ActionOutcome, { props: { outcomeKey: key } });
  }

  it('renders nothing for a key that is not in the table', async () => {
    for (const key of [null, '', 'you-lack-permission', 'stale; DROP TABLE']) {
      expect(await renderOutcome(key)).not.toContain('gf-note');
    }
  });

  it('renders the staleness message for a stale outcome', async () => {
    expect(await renderOutcome('stale')).toContain(MR_ACTION_MESSAGES.stale);
  });

  it('renders the applied message for an applied outcome', async () => {
    const html = await renderOutcome('applied');
    expect(html).toContain('Applied.');
    expect(html).toContain(MR_ACTION_MESSAGES.applied);
  });
});

describe('SPEC-0048 AC1 — the open form', () => {
  it('defaults the source ref to the revision being browsed', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(OpenMergeRequest, {
      props: { repositoryID: 'acme/web', revision: 'feature-x' },
    });
    expect(html).toContain('action="/api/repos/acme%2Fweb/merge_requests"');
    expect(html).toContain('value="feature-x"');
    expect(html).toContain('name="target_ref"');
  });
});

describe('SPEC-0048 AC9 — every length value ships its unit', () => {
  it('renders no unitless length, which the browser would drop silently', async () => {
    // The T-0048 capture review found 197 of these: Astro serialises a style
    // object's values verbatim, so `gap: 24` ships as `gap:24` and is dropped.
    // No DOM assertion could see it; only a screenshot could.
    const html = await renderActions();
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    for (const style of styles) {
      for (const declaration of style.split(';')) {
        const [property, rawValue] = declaration.split(':');
        if (!property || !rawValue) continue;
        const value = rawValue.trim();
        if (!/^-?\d+(\.\d+)?$/.test(value)) continue;
        // A bare number is legal only for the unitless properties.
        expect(['flex', 'flex-grow', 'flex-shrink', 'order', 'opacity', 'z-index', 'line-height', 'font-weight'])
          .toContain(property.trim());
      }
    }
  });
});
