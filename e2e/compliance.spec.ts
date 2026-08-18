// SPEC-0050 AC11 / SPEC-0051 AC11: the compliance surfaces, driven through the
// browser.
//
// The unit tests prove the reader and the clients. This proves what they
// cannot: that a truncated pack reaches a reader as a warning rather than as a
// shorter pack, and that a bounded expiry reaches an admin as the date the
// server granted rather than the one they typed.
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

  test('the shell offers Compliance and it leads somewhere real', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Compliance' }).click();
    await expect(page).toHaveURL(/\/compliance\/evidence-packs$/);
    await expect(page.getByRole('heading', { name: 'Evidence packs' })).toBeVisible();
  });

  test('read a pack that streamed whole', async ({ page }) => {
    const origins = recordOrigins(page);

    await page.goto('/compliance/evidence-packs?pack_id=pack-ready');
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    await expect(page.getByText('APPROVALS').first()).toBeVisible();
    // No truncation notice: this pack ended with its final marker.
    await expect(page.getByText('This pack is incomplete')).toHaveCount(0);

    expect([...origins]).toEqual(['http://localhost:4322']);
  });

  test('a pack whose stream stopped is called incomplete, not shown short', async ({ page }) => {
    await page.goto('/compliance/evidence-packs?pack_id=pack-truncated');

    // The upstream answered 200. The page must still refuse to call it whole.
    await expect(page.getByText('This pack is incomplete', { exact: false })).toBeVisible();
    await expect(page.getByText('not authoritative', { exact: false })).toBeVisible();

    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['pack is complete', 'fully assembled', 'permission', 'denied']) {
      expect(body).not.toContain(claim);
    }
  });

  test('a degraded section says so and names its gap', async ({ page }) => {
    await page.goto('/compliance/evidence-packs?pack_id=pack-degraded');
    await expect(page.getByText('This section is incomplete', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('RETENTION').first()).toBeVisible();
  });

  test('a failed pack shows the reason the server gave, and no more', async ({ page }) => {
    await page.goto('/compliance/evidence-packs?pack_id=pack-failed');
    await expect(page.getByText('Failed', { exact: true })).toBeVisible();
    await expect(page.getByText('the audit chain was unreadable', { exact: false })).toBeVisible();
  });

  test('request a pack from the form', async ({ page }) => {
    await page.goto('/compliance/evidence-packs');
    await page.getByLabel('From (inclusive, UTC)').fill('2026-07-01');
    await page.getByLabel('To (exclusive, UTC)').fill('2026-08-01');
    await page.getByRole('button', { name: 'Request pack' }).click();
    await expect(page).toHaveURL(/pack_id=pack-ready/);

    await page.goto(page.url());
    await expect(page.getByText('Ready', { exact: true })).toBeVisible();
  });

  test('grants list renders each state, and never computes one', async ({ page }) => {
    await page.goto('/compliance/auditor-grants');

    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Expired', { exact: true }).first()).toBeVisible();

    // grant-past-active expired in 2020 by its own date and the server still
    // calls it ACTIVE. A page that computed state from the clock fails here.
    const pastActive = page.locator('article', { hasText: 'grant-past-active' });
    await expect(pastActive.getByText('Active', { exact: true })).toBeVisible();
    await expect(pastActive.getByText('Expired', { exact: true })).toHaveCount(0);
  });

  test('issuing a grant shows the expiry the server granted, not the one asked for', async ({ page }) => {
    await page.goto('/compliance/auditor-grants');
    await page.getByLabel('Auditor principal', { exact: true }).fill('auditor@example.test');
    await page.getByLabel('Evidence range from (UTC)').fill('2026-07-01');
    await page.getByLabel('Evidence range to (UTC)').fill('2026-08-01');
    await page.getByLabel('Pack IDs (one per line)').fill('pack-ready');
    // Ask for December; the server bounds it to September.
    await page.getByLabel('Expires (UTC)').fill('2026-12-01');
    await page.getByRole('button', { name: 'Issue grant' }).click();

    await expect(page).toHaveURL(/grant_outcome=issued/);

    // Re-request so the list below is the signed-in render. The stub bounds
    // the requested December expiry to September; the December date must not
    // appear anywhere, and an empty page would pass that vacuously — so the
    // September one is asserted present too.
    await page.goto(page.url());
    await expect(page.getByText('2026-09-01').first()).toBeVisible();
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('2026-12-01');
  });

  test('revoke goes through a plain form', async ({ page }) => {
    await page.goto('/compliance/auditor-grants');
    await page.locator('article', { hasText: 'grant-1' }).getByRole('button', { name: 'Revoke' }).first().click();
    await expect(page).toHaveURL(/grant_outcome=revoked/);
  });
});
