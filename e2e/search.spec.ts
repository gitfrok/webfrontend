// SPEC-0049 AC12: code search, and the three things an empty page can mean.
//
// The unit tests prove the reading. This proves the part they cannot: that a
// person who searches and gets nothing is told something true rather than
// something convenient.
// **Harness limit, and why the journeys re-navigate after a form submit.**
// The production session cookie is named `__Host-gitfrok_session`, and
// Chromium accepts a `__Host-` cookie only over https — so rather than weaken
// the cookie the app actually sets, these journeys send it as a request
// header (`extraHTTPHeaders`). Those headers are NOT applied when the browser
// follows the 303 that every form POST here answers with, so the redirected
// page renders signed-out and reads nothing from the BFF.
//
// The submit therefore proves the redirect, and a `page.goto` of the resulting
// URL proves what that URL renders. Asserting page CONTENT directly after a
// submit would silently assert the signed-out page instead, which is how a
// green journey can prove less than it appears to.
import { test, expect, type Page } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

function recordOrigins(page: Page): Set<string> {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  return origins;
}

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('search from the shell and read results', async ({ page }) => {
    const origins = recordOrigins(page);

    await page.goto('/');
    await page.getByRole('link', { name: 'Search' }).click();
    await expect(page).toHaveURL(/\/search$/);

    await page.getByLabel('Query', { exact: true }).fill('BuildQuery');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page).toHaveURL(/q=BuildQuery/);

    // Re-request the URL the submit produced, so the assertions below run
    // against a signed-in render rather than the harness's signed-out one.
    await page.goto(page.url());
    await expect(page.getByText('internal/db/query.go', { exact: false }).first()).toBeVisible();
    // The second hit carries no enrichment metadata and must still render.
    await expect(page.getByText('internal/db/query_test.go', { exact: false }).first()).toBeVisible();

    // No count anywhere: the contract carries no total to render.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toMatch(/\bof\s+\d+\b/);
    expect(body.toLowerCase()).not.toContain('showing');

    expect([...origins]).toEqual(['http://localhost:4322']);
  });

  test('paging follows the opaque token', async ({ page }) => {
    await page.goto('/search?q=BuildQuery&mode=SUBSTRING');
    await page.getByRole('link', { name: 'More results' }).click();
    await expect(page).toHaveURL(/page_token=page-2/);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body.toLowerCase()).not.toContain('page 2 of');
  });

  test('an empty page never claims nothing exists', async ({ page }) => {
    await page.goto('/search?q=nothing&mode=SUBSTRING');

    await expect(page.getByText('That is not the same as nothing existing', { exact: false })).toBeVisible();
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['no results', 'no matches', 'not found', '0 results']) {
      expect(body).not.toContain(claim);
    }
  });

  test('a cold index says so, beside the empty state rather than instead of it', async ({ page }) => {
    await page.goto('/search?q=cold&mode=SUBSTRING');

    await expect(page.getByText('That is not the same as nothing existing', { exact: false })).toBeVisible();
    await expect(page.getByText('The index currently holds no repositories', { exact: false })).toBeVisible();
  });

  test('an unreadable index reads as unknown, never as empty', async ({ page }) => {
    await page.goto('/search?q=statusbroken&mode=SUBSTRING');

    await expect(page.getByText('could not be read', { exact: false })).toBeVisible();
    // "we could not ask" must not become "the index is empty".
    await expect(page.getByText('The index currently holds no repositories', { exact: false })).toHaveCount(0);
  });

  test('a mode the contract does not name is refused with a reason a person can act on', async ({ page }) => {
    await page.goto('/search?search_outcome=modeRefused');
    await expect(page.getByText('must be one this build offers', { exact: false })).toBeVisible();
  });
});
