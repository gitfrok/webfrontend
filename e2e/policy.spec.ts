// SPEC-0055 AC10: policy visibility, and the absence that must not read as a
// missing permission.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('the shell offers Policy and it shows the bundle in force', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Policy' }).click();
    await expect(page).toHaveURL(/\/policy$/);
    await expect(page.getByText('0.10.0').first()).toBeVisible();
  });

  test('it says where policy is authored, and offers no form to author one', async ({ page }) => {
    await page.goto('/policy');

    await expect(page.getByText('governance repository', { exact: false })).toBeVisible();

    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const wrong of ['coming soon', 'contact your administrator', 'you do not have permission', 'request access']) {
      expect(body).not.toContain(wrong);
    }
    // AC7: nothing disabled, nothing greyed out waiting to be unlocked.
    expect(await page.locator('#main [disabled]').count()).toBe(0);
    // The only control is the decision lookup.
    expect(await page.locator('#main textarea').count()).toBe(0);
  });

  test('a decision shows the revision that decided it', async ({ page }) => {
    await page.goto('/policy?decision_id=d-1');
    await expect(page.getByText('Decided by revision')).toBeVisible();
    await expect(page.getByText('repo.read')).toBeVisible();
    await expect(page.getByText('enforced', { exact: true })).toBeVisible();
  });

  test('a dry-run decision says it decided nothing', async ({ page }) => {
    await page.goto('/policy?decision_id=dryrun');
    await expect(page.getByText('decided nothing', { exact: false })).toBeVisible();
  });

  test('a denial is not rendered as a failure', async ({ page }) => {
    await page.goto('/policy?decision_id=denied');
    await expect(page.getByText('Denied', { exact: true })).toBeVisible();
    const tone = await page.locator('#main .gf-status').first().getAttribute('class');
    expect(tone).not.toContain('gf-status-danger');
  });

  test('an unreadable decision says nothing about whether it exists', async ({ page }) => {
    await page.goto('/policy?decision_id=missing');
    await expect(page.getByText('Nothing here says whether it exists', { exact: false })).toBeVisible();
  });
});
