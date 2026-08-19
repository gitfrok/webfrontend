// SPEC-0058 AC12–AC19: the admin area through the browser — the fleet report and
// its age, the audit door, and the panels that are absent.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('reports every data plane with its state and when it last reported', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByText('dp-eu-1')).toBeVisible();
    await expect(page.getByText('Connected', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('dp-us-1')).toBeVisible();
    await expect(page.getByText('Stale', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('4d ago', { exact: false })).toBeVisible();
  });

  test('a provisioned plane that never connected says it has had no contact', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByText('tok-provisioned-9')).toBeVisible();
    await expect(page.getByText('no contact yet')).toBeVisible();
    await expect(page.getByText('Never connected', { exact: false })).toBeVisible();
  });

  test('says the report is a report, and what it cannot see', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByText('not a live view', { exact: false })).toBeVisible();
    await expect(page.getByText('connects outbound to the control plane', { exact: false })).toBeVisible();
    await expect(page.getByText('CI runners inside a data plane are not visible', { exact: false })).toBeVisible();
  });

  test('the audit section is a door into the grant flow, not a log', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByText('Audit access is issued as a grant', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Issue, list and revoke auditor grants' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request and read an evidence pack' })).toBeVisible();

    // The panel talks about audit access and says the trail is not here. What must
    // not exist is a rendering of it: no heading naming the log, no table, and
    // nothing to fetch one with.
    await expect(page.getByRole('heading', { name: /audit (log|trail)/i })).toHaveCount(0);
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    expect(body).toContain('no audit log to browse');
    expect(body).not.toContain('last active');
    expect(await page.locator('[disabled]').count()).toBe(0);
  });

  test('says why members and roles are absent instead of showing an empty table', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByText('Members and roles are not shown here', { exact: false })).toBeVisible();
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const phrase of ['coming soon', 'not yet available']) {
      expect(body).not.toContain(phrase);
    }
  });

  test('an unavailable report says so and describes nothing', async ({ page, browser }) => {
    // The page is rendered server-side, so a browser-side route interception would
    // never see this fetch. The stub refuses for a session named for it instead,
    // which is also closer to the real condition: the BFF answers, or it does not.
    const context = await browser.newContext({
      extraHTTPHeaders: { cookie: '__Host-gitfrok_session=e2e-session-nofleet' },
    });
    const nofleet = await context.newPage();
    await nofleet.goto('/admin');
    page = nofleet;

    await expect(page.getByText('The fleet report could not be read', { exact: false })).toBeVisible();
    await expect(page.getByText('No data planes are enrolled', { exact: false })).toHaveCount(0);
    expect(await page.locator('table').count()).toBe(0);
  });

  test('the admin destination is in the nav and is marked current', async ({ page }) => {
    await page.goto('/admin');
    const current = page.locator('nav a[aria-current="page"]');
    await expect(current).toHaveText('Admin');
  });
});
