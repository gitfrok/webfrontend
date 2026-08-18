// SPEC-0052 AC13: the landing page, and the three answers a list can give.
//
// Harness limit: see e2e/search.spec.ts — a submit proves the redirect, and a
// goto of the resulting URL proves what that URL renders.
import { test, expect, type Page } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

function recordOrigins(page: Page): Set<string> {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  return origins;
}

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('the landing page lists repositories and links to their trees', async ({ page }) => {
    const origins = recordOrigins(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Repositories', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gateway API' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();

    // No count anywhere: the contract carries no total to render.
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toMatch(/\bof\s+\d+\b/);

    await page.getByRole('link', { name: 'Gateway API' }).click();
    await expect(page).toHaveURL(/\/repos\/repo-1\/tree\/main/);

    expect([...origins]).toEqual(['http://localhost:4322']);
  });

  test('an empty list never claims the tenant has none', async ({ page }) => {
    await page.goto('/?page_token=empty');

    await expect(page.getByText('Nothing here is visible to you yet', { exact: false })).toBeVisible();
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['no repositories', 'there are none', 'not found', '0 repositories']) {
      expect(body).not.toContain(claim);
    }
  });

  test('a refusal is told apart from an empty list', async ({ page }) => {
    await page.goto('/?page_token=refuse');

    await expect(page.getByText('could not be read', { exact: false })).toBeVisible();
    // "we could not ask" must not render as "nothing is visible to you".
    await expect(page.getByText('Nothing here is visible to you yet', { exact: false })).toHaveCount(0);
  });
});
