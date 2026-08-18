// SPEC-0048 AC11: the merge-request write loop, driven through the browser.
//
// The unit tests prove the wire and the branching. This proves the thing they
// cannot: that a person can reach these controls, that the forms carry the
// right hidden fields through a real form submission, and that a refusal
// reaches the reader as a note rather than as a blank page.
//
// It runs with JavaScript doing nothing — these are plain forms, which is what
// keeps AC6 honest: a control that is markup cannot decide not to render.
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

  test('review a merge request and see the outcome', async ({ page }) => {
    const origins = recordOrigins(page);

    await page.goto('/repos/repo-1/merge_requests/mr-1');
    await expect(page.getByRole('heading', { name: 'Add the thing' })).toBeVisible();

    // AC6: both controls are there, for a session the stub gives no roles.
    await expect(page.getByRole('button', { name: 'Submit review' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Merge into/ })).toBeVisible();

    // AC7: three dispositions, each with its own word.
    await expect(page.getByText('Approved')).toBeVisible();
    await expect(page.getByText('Changes requested')).toBeVisible();
    await expect(page.getByText('Commented')).toBeVisible();

    await page.getByRole('radio', { name: /Changes requested/ }).check();
    await page.getByRole('textbox', { name: 'Comment (optional)' }).fill('needs a test');
    await page.getByRole('button', { name: 'Submit review' }).click();

    await expect(page).toHaveURL(/mr_outcome=applied/);

    await page.goto(page.url());
    await expect(page.getByText('The merge request below is as it now stands.')).toBeVisible();
    // The review landed: the stub advances the version on a successful write.
    await expect(page.getByText('version 2', { exact: false })).toBeVisible();

    // Everything came from this origin's SSR routes; the BFF is upstream of
    // the server and never of the browser.
    expect([...origins]).toEqual(['http://localhost:4322']);
  });

  test('merge a merge request', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-1');
    await page.getByRole('button', { name: /^Merge into/ }).click();
    await expect(page).toHaveURL(/mr_outcome=applied/);
  });

  test('a merge request that moved under you reads as staleness', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-stale');
    await page.getByRole('button', { name: /^Merge into/ }).click();

    await expect(page).toHaveURL(/mr_outcome=stale/);
    await expect(page.getByText('This merge request changed since you loaded it', { exact: false })).toBeVisible();
  });

  test('a refusal names no cause', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-refuses');
    await page.getByRole('button', { name: /^Merge into/ }).click();

    await expect(page).toHaveURL(/mr_outcome=notApplied/);
    await expect(page.getByText('That did not take effect', { exact: false })).toBeVisible();

    // AC4, at the surface a person actually sees.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['permission', 'denied', 'not allowed', 'unauthorized', 'blocked by policy']) {
      expect(body).not.toContain(claim);
    }
  });

  test('open a merge request from the browse surface', async ({ page }) => {
    await page.goto('/repos/repo-1/tree/main');
    // The form is behind a <details>; its summary is the disclosure control.
    await page.locator('summary', { hasText: 'Open a merge request' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('From the browser');
    await page.getByRole('button', { name: 'Open merge request' }).click();

    await expect(page).toHaveURL(/\/merge_requests\/mr-new\?mr_outcome=applied/);
  });
});
