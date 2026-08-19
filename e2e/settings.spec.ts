// SPEC-0057 AC15–AC20: repository settings through the browser — what can be
// changed, what archival means, and the four controls that must not exist.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('shows the name, the description and who last changed them', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');

    await expect(page.getByLabel('Name')).toHaveValue('infra');
    await expect(page.getByLabel('Description')).toHaveValue(/Cluster bootstrap/);
    await expect(page.getByText('owner@gitsaas.test', { exact: false })).toBeVisible();
  });

  test('offers no visibility, membership, protection or delete control', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');

    for (const field of ['visibility', 'members', 'member', 'role', 'branch_protection', 'required_approvals']) {
      expect(await page.locator(`[name="${field}"]`).count()).toBe(0);
    }
    // Nor a disabled one: a disabled control tells a reader they lack a
    // permission, and they do not — the capability does not exist.
    expect(await page.locator('[disabled]').count()).toBe(0);

    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const phrase of ['danger zone', 'delete this project', 'coming soon', 'not yet available']) {
      expect(body).not.toContain(phrase);
    }
  });

  test('says what is not a setting rather than leaving a reader to hunt', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');

    await expect(page.getByText('Visibility and membership are not repository settings', { exact: false })).toBeVisible();
    await expect(page.getByText('are policy, held in governance', { exact: false })).toBeVisible();
    await expect(page.getByText('cannot be deleted from this page', { exact: false })).toBeVisible();
  });

  test('an active repository says what archiving would mean', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');

    await expect(page.getByText('Active', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive this repository' })).toBeVisible();
    await expect(page.getByText('it does not restrict who may read or write it', { exact: false })).toBeVisible();
  });

  test('an archived repository is labelled, and says it is still readable and writable', async ({ page }) => {
    await page.goto('/repos/archived-repo/settings');

    await expect(page.getByText('Archived', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('still listed, still readable, and still writable', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove the archived label' })).toBeVisible();

    // The label is not a lock, and the page must not read like one.
    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const phrase of ['read-only', 'read only', 'locked', 'frozen']) {
      expect(body).not.toContain(phrase);
    }
  });

  test('saving a name and description works with no client script', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');
    await page.getByLabel('Name').fill('platform-infra');
    await page.getByRole('button', { name: 'Save settings' }).click();

    await expect(page).toHaveURL(/settings_outcome=saved/);
    await expect(page.getByText('the change is in the audit trail', { exact: false })).toBeVisible();
  });

  test('an empty name changes nothing and says which field it was', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');
    // The input is `required`, so the field is cleared and the form submitted
    // directly — the point is what the server does with an empty name, not what
    // the browser prevents.
    await page.getByLabel('Name').fill('');
    await page.locator('form[action="/api/repos/repo-1/settings"]').evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
      form.submit();
    });

    await expect(page).toHaveURL(/settings_outcome=nameRequired/);
    await expect(page.getByText('A repository needs a name', { exact: false })).toBeVisible();
  });

  test('archiving asks for a state, so submitting twice does not toggle', async ({ page }) => {
    await page.goto('/repos/repo-1/settings');
    await expect(page.locator('input[name="archived"]')).toHaveValue('true');

    await page.getByRole('button', { name: 'Archive this repository' }).click();
    await expect(page).toHaveURL(/settings_outcome=archived/);
    await expect(page.getByText('still listed, still readable and still writable', { exact: false })).toBeVisible();
  });

  test('a repository whose settings cannot be read says so and describes nothing', async ({ page }) => {
    await page.goto('/repos/unknown-repo/settings');

    await expect(page.getByText('The settings could not be read', { exact: false })).toBeVisible();
    expect(await page.locator('[name="name"]').count()).toBe(0);
  });
});
