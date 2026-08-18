// SPEC-0054 AC14: the runs list, and the absence it has to state.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('the shell offers Pipelines and it lists runs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Pipelines' }).click();
    await expect(page).toHaveURL(/\/pipelines$/);

    // Scoped to the body of the table: "Queued" is also a column header, and
    // the state badges are what this asserts.
    const rows = page.locator('tbody');
    for (const state of ['Succeeded', 'Failed', 'Running', 'Queued', 'Cancelled']) {
      await expect(rows.getByText(state, { exact: true })).toBeVisible();
    }
  });

  test('the page says job output is not kept, and offers nothing to open', async ({ page }) => {
    await page.goto('/pipelines');

    await expect(page.getByText('Job output is not kept', { exact: false })).toBeVisible();

    // No promise, and nothing that looks like a door.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const promise of ['coming soon', 'not yet available', 'view log']) {
      expect(body).not.toContain(promise);
    }
    // Scoped to the page's own content: the shell's Sign out is a button and
    // is not this surface's concern.
    expect(await page.locator('#main button').count()).toBe(0);
  });

  test('an unfinished run shows no invented finish time', async ({ page }) => {
    await page.goto('/pipelines');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('1970');
  });

  test('an empty list never claims nothing has run', async ({ page }) => {
    await page.goto('/pipelines?page_token=empty');

    await expect(page.getByText('No runs are visible to you here', { exact: false })).toBeVisible();
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const claim of ['nothing has run', 'there are none', 'never run']) {
      expect(body).not.toContain(claim);
    }
  });

  test('a refusal is told apart from an empty list', async ({ page }) => {
    await page.goto('/pipelines?page_token=refuse');
    await expect(page.getByText('could not be read', { exact: false })).toBeVisible();
    await expect(page.getByText('No runs are visible to you here', { exact: false })).toHaveCount(0);
  });
});
