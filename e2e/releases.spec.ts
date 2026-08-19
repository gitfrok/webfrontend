// SPEC-0056 AC16: releases through the browser, and the three things a tag can
// be doing relative to what a release recorded.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('lists releases and says no files are stored', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');

    await expect(page.getByRole('link', { name: 'v1.0.0' })).toBeVisible();
    await expect(page.getByText('No files are stored', { exact: false })).toBeVisible();

    // Nothing to upload and nothing to download.
    expect(await page.locator('input[type=file]').count()).toBe(0);
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const promise of ['coming soon', 'download', 'attach a file']) {
      expect(body).not.toContain(promise);
    }
  });

  test('a release whose tag still points where it did says nothing about it', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    const first = page.locator('article', { hasText: 'v1.0.0' });
    await expect(first.getByText('Tag moved')).toHaveCount(0);
    await expect(first.getByText('Tag gone')).toHaveCount(0);
  });

  test('a release whose tag has moved says so and still shows the recorded commit', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    const moved = page.locator('article', { hasText: 'v0.9.0' });

    await expect(moved.getByText('Tag moved')).toBeVisible();
    await expect(moved.getByText('points at a different commit', { exact: false })).toBeVisible();
    // The recorded commit, not the tag's current target.
    await expect(moved.getByText('bbbbbbb')).toBeVisible();
    await expect(moved.getByText('ccccccc')).toHaveCount(0);
  });

  test('a release whose tag is gone is kept and says the tag is gone', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    const gone = page.locator('article', { hasText: 'v0.8.0' });

    await expect(gone.getByText('Tag gone')).toBeVisible();
    await expect(gone.getByText('no longer exists', { exact: false })).toBeVisible();
    // It happened and was announced; hiding it would make the record less true
    // than the world.
    await expect(gone.getByText('eeeeeee')).toBeVisible();
  });

  test('publishing offers only tags that have no release yet', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    await page.locator('summary', { hasText: 'Publish a release' }).click();

    const options = await page.locator('select[name=tag] option').allTextContents();
    expect(options.join(' ')).toContain('v1.1.0');
    // v1.0.0 already has one, so offering it would invite a conflict.
    expect(options.join(' ')).not.toContain('v1.0.0');
  });

  test('publishing a release lands and reports it', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    await page.locator('summary', { hasText: 'Publish a release' }).click();
    await page.getByLabel('Notes').fill('A new one.');
    await page.getByRole('button', { name: 'Publish release' }).click();

    await expect(page).toHaveURL(/release_outcome=published/);
    await page.goto(page.url());
    await expect(page.getByText('records the commit its tag pointed at', { exact: false })).toBeVisible();
  });

  test('a release note is displayed, not executed', async ({ page }) => {
    await page.goto('/repos/repo-1/releases');
    // Nothing a note could contain becomes an element.
    expect(await page.locator('article script').count()).toBe(0);
  });
});
