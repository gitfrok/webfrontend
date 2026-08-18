// SPEC-0047 AC10 — the grayscale gate as an artifact, not a promise.
//
// ADR-0069 makes three laws binding, and the third is a review: every surface
// is looked at once through a grayscale filter and once through a deuteranopia
// simulation before it merges. A claim like "the encodings should survive
// grayscale" is exactly the kind of accessibility assertion that goes unchecked
// for years, so this run produces files a human can open and disagree with.
//
// Two things this run does NOT claim:
//   1. It does not compare the captures automatically. Deciding whether two
//      states are *distinguishable* is a judgement, and ADR-0069 open decision
//      4 is precisely whether to automate it. What is automated here is that
//      the artifacts exist, cover every surface, and are captured under the
//      real stylesheet.
//   2. It runs against the stub BFF, not a live cluster. That is deliberate:
//      the fixtures are state-DENSE (every severity, every envelope state, a
//      telemetry gap, a deferred dimension) in a way live data on any given day
//      is not. A grayscale review is only as good as the states on the screen.
import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'artifacts', 'cvd');

/**
 * The deuteranopia transform, as an SVG colour matrix injected into the page.
 *
 * These are the Viénot-Brettel-Mollon coefficients Chrome DevTools' own
 * "emulate vision deficiencies" uses, so a reviewer comparing this capture with
 * a manual DevTools pass sees the same image rather than two different
 * approximations.
 */
const DEUTAN_MATRIX = '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0';

/** Production names the session cookie with a __Host- prefix; see the note at
 *  each use for why the capture sends it as a header instead. */
const SESSION_HEADER = { cookie: '__Host-gitfrok_session=capture-session' };

const SURFACES = [
  { name: 'shell-and-repo-tree', path: '/repos/gateway-api/tree/main/' },
  { name: 'file-view', path: '/repos/gateway-api/file/main/README.md' },
  { name: 'diff-view', path: '/repos/gateway-api/diff/main' },
  { name: 'security-dashboard', path: '/security' },
  { name: 'usage-view', path: '/usage' },
  // T-0049: the review controls. The dispositions are the phase's newest
  // colour-carrying vocabulary, and approve/request-changes is exactly the
  // pair a deutan reader would lose if the glyphs ever came off.
  { name: 'merge-request-actions', path: '/repos/repo-1/merge_requests/mr-capture' },
  // The staleness note, which is the only outcome copy that says something
  // more than "did not take effect" — worth seeing rendered.
  { name: 'merge-request-stale-note', path: '/repos/repo-1/merge_requests/mr-capture?mr_outcome=stale' },
  // T-0051: the pack that streamed whole, and the one that did not. The
  // truncation notice is the single most important thing on this surface to
  // review with colour removed — if it reads as decoration, a reader hands an
  // auditor a document that is not what it appears to be.
  { name: 'evidence-pack-complete', path: '/compliance/evidence-packs?pack_id=pack-ready' },
  { name: 'evidence-pack-truncated', path: '/compliance/evidence-packs?pack_id=pack-truncated' },
  { name: 'evidence-pack-degraded', path: '/compliance/evidence-packs?pack_id=pack-degraded' },
  // T-0052: all three grant states side by side, which is the whole reason
  // they are their own distinctness set.
  { name: 'auditor-grants', path: '/compliance/auditor-grants' },
  // T-0050: results, and the empty state that means three different things.
  // The empty one matters most — it is the surface where the honest copy is
  // longer than the dishonest copy, and a grayscale read is where you find
  // out whether length made it unreadable.
  { name: 'search-results', path: '/search?q=BuildQuery&mode=SUBSTRING' },
  { name: 'search-empty', path: '/search?q=nothing&mode=SUBSTRING' },
  { name: 'search-cold-index', path: '/search?q=cold&mode=SUBSTRING' },
  // T-0055: the landing page, at last showing something. The empty variant is
  // the one to read closely — it is the page where a false absence claim
  // would be believed fastest.
  { name: 'repository-list', path: '/' },
  { name: 'repository-list-empty', path: '/?page_token=empty' },
  // T-0058: blame is where "who wrote this line" reads as accountability, so
  // the grayscale pass is checking that the git-identity note survives being
  // the least prominent thing on the page.
  { name: 'file-blame', path: '/repos/repo-1/file/main/README.md?view=blame' },
  { name: 'file-blame-capped', path: '/repos/repo-1/file/main/capped.go?view=blame' },
  { name: 'file-history', path: '/repos/repo-1/file/main/README.md?view=history' },
  // T-0061: every job state in one column, which is how a reader actually
  // scans this table — and succeeded against failed is the pair a deutan
  // reader separates least well.
  { name: 'pipeline-runs', path: '/pipelines' },
];

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.describe('SPEC-0047 AC10 — CVD capture set', () => {
  for (const surface of SURFACES) {
    test(`captures ${surface.name} in colour, grayscale and deuteranopia`, async ({ page }) => {
      // The production cookie name carries the __Host- prefix, which Chromium
      // accepts only over https. Rather than weaken the cookie the app really
      // sets, the capture sends it as a request header — the same choice
      // browse.spec.ts made, and the SSR layer forwards either form.
      await page.setExtraHTTPHeaders(SESSION_HEADER);

      await page.goto(surface.path, { waitUntil: 'networkidle' });

      // The fonts are ours and self-hosted; wait for them so the capture shows
      // the shipped typography rather than a fallback (AC3 is what makes this
      // deterministic — there is no CDN to be slow).
      await page.evaluate(() => document.fonts.ready);

      await page.screenshot({ path: join(OUT, `${surface.name}.colour.png`), fullPage: true });

      // Grayscale: the monochromacy case, and the one a reviewer can reproduce
      // by printing the page.
      await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
      await page.screenshot({ path: join(OUT, `${surface.name}.grayscale.png`), fullPage: true });
      await page.evaluate(() => {
        document.querySelectorAll('style').forEach((s) => {
          if (s.textContent?.includes('grayscale(1)')) s.remove();
        });
      });

      // Deuteranopia: the ~6% case the brand kit is built around.
      await page.evaluate((matrix) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', 'position:absolute;width:0;height:0');
        svg.innerHTML =
          `<filter id="deutan"><feColorMatrix type="matrix" values="${matrix}"/></filter>`;
        document.body.appendChild(svg);
        document.documentElement.style.filter = 'url(#deutan)';
      }, DEUTAN_MATRIX);
      await page.screenshot({ path: join(OUT, `${surface.name}.deuteranopia.png`), fullPage: true });

      for (const variant of ['colour', 'grayscale', 'deuteranopia']) {
        expect(
          existsSync(join(OUT, `${surface.name}.${variant}.png`)),
          `${surface.name}.${variant}.png was not written`,
        ).toBe(true);
      }
    });
  }

  // The captures prove the encodings are VISIBLE. These assertions prove they
  // are PRESENT — a screenshot cannot tell you a marker was missing from the
  // DOM rather than merely hard to see.
  test('the diff carries its markers as text, not as tint', async ({ page }) => {
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/repos/gateway-api/diff/main', { waitUntil: 'networkidle' });

    const added = page.locator('[data-diff-kind="add"]');
    await expect(added.first()).toBeVisible();
    await expect(added.first()).toContainText('+');
    await expect(page.getByLabel('added line').first()).toBeVisible();
  });

  test('every envelope state on the usage view carries a word', async ({ page }) => {
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/usage', { waitUntil: 'networkidle' });

    for (const state of ['WITHIN', 'NEAR', 'EXCEEDED']) {
      await expect(page.getByText(state, { exact: false }).first()).toBeVisible();
    }
    // The deferred row says why, and never shows a zero (SPEC-0046 AC5).
    await expect(page.getByText('Not metered yet').first()).toBeVisible();
  });

  test('every review disposition carries its own glyph, not only a tone', async ({ page }) => {
    // The pill's glyph comes from CSS ::before content, so this reads the
    // computed value rather than the markup: a disposition that lost its
    // override would silently inherit its tone's glyph and two dispositions
    // would start looking alike (SPEC-0048 AC8).
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/repos/repo-1/merge_requests/mr-capture', { waitUntil: 'networkidle' });
    const glyphs = await page.evaluate(() =>
      ['approve', 'request-changes', 'comment'].map((name) => {
        const element = document.querySelector(`.gf-disposition-${name}`);
        return element ? getComputedStyle(element, '::before').content : '';
      }),
    );
    expect(glyphs.every((g) => g && g !== 'none')).toBe(true);
    expect(new Set(glyphs).size).toBe(3);
  });

  test('every grant state is told apart by glyph and word, not by tone', async ({ page }) => {
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/compliance/auditor-grants', { waitUntil: 'networkidle' });

    // All three render side by side in this list. If two ever shared a glyph,
    // the distinction would be carried by hue alone for a reader who cannot
    // see hue (SPEC-0051 AC8).
    for (const word of ['Active', 'Revoked', 'Expired']) {
      await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
    }
    const glyphs = await page.evaluate(() =>
      ['gf-status-success', 'gf-status-warn', 'gf-status-pending'].map((tone) => {
        const element = document.querySelector(`.gf-status.${tone}`);
        return element ? getComputedStyle(element, '::before').content : '';
      }),
    );
    expect(new Set(glyphs).size).toBe(3);
  });

  test('a truncated pack says so in words, not only in colour', async ({ page }) => {
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/compliance/evidence-packs?pack_id=pack-truncated', { waitUntil: 'networkidle' });

    // The words are the channel that survives grayscale, deuteranopia and a
    // printed page alike.
    await expect(page.getByText('This pack is incomplete', { exact: false })).toBeVisible();
    await expect(page.getByText('not authoritative', { exact: false })).toBeVisible();
  });

  test('the empty search page states no absence and no count', async ({ page }) => {
    await page.setExtraHTTPHeaders(SESSION_HEADER);
    await page.goto('/search?q=nothing&mode=SUBSTRING', { waitUntil: 'networkidle' });

    // PR-19's leak, inverted: telling an unauthorized reader that nothing
    // exists is as much a disclosure as showing them what does.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['no results', 'no matches', 'not found', '0 results']) {
      expect(body).not.toContain(claim);
    }
    expect(body).not.toMatch(/\bof\s+\d+\b/);
    await expect(page.getByText('That is not the same as nothing existing', { exact: false })).toBeVisible();
  });
});
