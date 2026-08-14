// SPEC-0021 AC6: Playwright covers tree → file → diff navigation.
// SPEC-0008 AC1/AC3 and SPEC-0021 AC4 ride along: every view renders server-side
// from the BFF, and the browser reaches no other origin — asserted, not assumed.
import { test, expect, type Page } from '@playwright/test';

const repositoryID = 'repo-1';
const revision = 'main';

// The session cookie is the only identity the SSR layer forwards. Its production
// name carries the __Host- prefix, which Chromium accepts only over https — so
// rather than weaken the cookie the app actually sets, the signed-in journeys
// send it as a request header. The SSR layer forwards the header either way;
// what is under test here is the browse path, not the browser's cookie-prefix
// rules, which are the platform's to enforce.
const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

// Every request the browser makes is recorded, so a view that quietly reached
// past the BFF — or reached the backend directly — fails the journey.
function recordOrigins(page: Page): Set<string> {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  return origins;
}

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('browse the tree, open a file, then compare revisions', async ({ page }) => {
    const origins = recordOrigins(page);

    await page.goto(`/repos/${repositoryID}/tree/${revision}`);
    await expect(page.getByRole('heading', { name: repositoryID })).toBeVisible();
    await expect(page.getByRole('link', { name: 'README.md' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'src' })).toBeVisible();

    await page.getByRole('link', { name: 'README.md' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/repos/${repositoryID}/file/${revision}/README.md$`));
    await expect(page.getByText('Browsed through the BFF.')).toBeVisible();

    await page.goto(`/repos/${repositoryID}/diff/${revision}`);
    await expect(page.getByText('diff --git a/README.md b/README.md')).toBeVisible();

    // The whole journey came from this origin's SSR routes. The BFF is upstream
    // of the server, never of the browser, and the backend is nowhere.
    expect([...origins]).toEqual(['http://localhost:4322']);
  });

  test('the command palette navigates tree → diff from the keyboard alone', async ({ page }) => {
    await page.goto(`/repos/${repositoryID}/tree/${revision}`);
    // The palette is a hydrated island: pressing before hydration would land on
    // a page that has no listener yet, which is a race in the test, not a defect
    // in the app.
    await page.waitForFunction(() => customElements.get('astro-island') !== undefined);

    // Compare revisions is the third command; arrows reach it, Enter executes it.
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/repos/${repositoryID}/diff/${revision}$`));
    await expect(page.getByText('diff --git a/README.md b/README.md')).toBeVisible();
  });
});

test('a view the session cannot have renders the one coarse refusal', async ({ page }) => {
  // No session: the stub refuses exactly as the BFF does, and the page says so
  // without naming what exists (SPEC-0021 AC2).
  await page.goto(`/repos/${repositoryID}/tree/${revision}`);

  await expect(page.getByText('This view is unavailable. Check your session or the revision.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'README.md' })).toHaveCount(0);
});
