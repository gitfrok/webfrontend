// SPEC-0053 AC14: blame and history through the browser, and the one thing
// they must never let a reader conclude.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('a file offers content, blame and history', async ({ page }) => {
    await page.goto('/repos/repo-1/file/main/README.md');
    await expect(page.getByRole('link', { name: 'Blame' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'History' })).toBeVisible();
  });

  test('history renders commits and says whose names these are', async ({ page }) => {
    await page.goto('/repos/repo-1/file/main/README.md?view=history');

    await expect(page.getByText('Add the thing')).toBeVisible();
    await expect(page.getByText('Git does not verify them', { exact: false })).toBeVisible();

    // A git author must never be presented as a platform account.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const word of ['account', 'profile', 'signed in as']) {
      expect(body).not.toContain(word);
    }
    expect(await page.locator('img').count()).toBe(0);
  });

  test('blame attributes line ranges without claiming the platform knows who', async ({ page }) => {
    await page.goto('/repos/repo-1/file/main/README.md?view=blame');

    await expect(page.getByText('1–12')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Git author' })).toBeVisible();
    await expect(page.getByText('Git does not verify them', { exact: false })).toBeVisible();
    // Not capped: no partial notice.
    await expect(page.getByText('longer than this view attributes', { exact: false })).toHaveCount(0);
  });

  test('a capped blame says the rest was not examined', async ({ page }) => {
    await page.goto('/repos/repo-1/file/main/capped.go?view=blame');

    await expect(page.getByText('Partial', { exact: true })).toBeVisible();
    await expect(page.getByText('longer than this view attributes', { exact: false })).toBeVisible();
    // It must not present the unshown part as looked-at-and-empty.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    expect(body).not.toContain('unattributed');
    expect(body).not.toContain('unknown author');
  });
});
