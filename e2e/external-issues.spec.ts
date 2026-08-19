// SPEC-0059 AC14–AC19: referencing an issue through the browser, and the two things
// the page must never imply.
//
// **Harness limit, as in mr-actions.spec.ts.** The session cookie is `__Host-`
// prefixed and Chromium accepts one only over https, so these journeys send it as a
// request header — and those headers are NOT applied when the browser follows the 303
// a form POST answers with. The submit proves the redirect; a page.goto of the
// resulting URL proves what that URL renders. Asserting content directly after a
// submit would assert the signed-out page, which is how a green journey proves less
// than it appears to.
import { test, expect } from '@playwright/test';

const sessionHeader = { cookie: '__Host-gitfrok_session=e2e-session' };

test.describe('signed in', () => {
  test.use({ extraHTTPHeaders: sessionHeader });

  test('references an issue with a plain form, and shows where the link goes', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-issues');

    await page.getByLabel('Tracker').fill('JIRA');
    await page.getByLabel('Issue key').fill('PLAT-1421');
    await page.getByLabel('Address').fill('https://tracker.example.test/browse/PLAT-1421');
    await page.getByRole('button', { name: 'Reference this issue' }).click();

    await expect(page).toHaveURL(/issue_outcome=linked/);
    await page.goto(page.url());
    const link = page.getByRole('link', { name: 'PLAT-1421' });
    await expect(link).toHaveAttribute('href', 'https://tracker.example.test/browse/PLAT-1421');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByText('at tracker.example.test', { exact: false })).toBeVisible();
  });

  test('says what a reference is, and that merging closes nothing', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-issues');

    await expect(page.getByText('This product stores no issue', { exact: false })).toBeVisible();
    await expect(page.getByText('never asks the tracker anything', { exact: false })).toBeVisible();
    await expect(page.getByText('Merging this request does not close anything', { exact: false })).toBeVisible();

    const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
    for (const phrase of ['will close', 'auto-close', 'synced', 'coming soon']) {
      expect(body).not.toContain(phrase);
    }
  });

  test('a reference missing its address changes nothing and says which fields are needed', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-issues');
    await page.getByLabel('Tracker').fill('JIRA');
    await page.getByLabel('Issue key').fill('PLAT-9');
    // The address input is `required` and typed `url`, so validation is disabled to
    // exercise what the server does rather than what the browser prevents.
    await page.locator('form[action="/api/repos/repo-1/merge_requests/mr-issues/external_issues"]').evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
      form.submit();
    });

    await expect(page).toHaveURL(/issue_outcome=invalid/);
    await page.goto(page.url());
    await expect(page.getByText('needs a tracker, an issue key, and an https address', { exact: false })).toBeVisible();
    // Nothing was added: the reference the form named is not on the page.
    await expect(page.getByText('PLAT-9')).toHaveCount(0);
  });

  test('a reference stored with a plain http address is shown as text, not as a link', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-capture');

    await expect(page.getByText('OLD-7')).toBeVisible();
    expect(await page.locator('a[href^="http://"]').count()).toBe(0);
    await expect(page.getByText('shown as text rather than as a link', { exact: false })).toBeVisible();
  });

  test('a reference can be removed by its identity', async ({ page }) => {
    await page.goto('/repos/repo-1/merge_requests/mr-issues');
    await page.getByLabel('Tracker').fill('Linear');
    await page.getByLabel('Issue key').fill('ENG-9');
    await page.getByLabel('Address').fill('https://linear.example.test/ENG-9');
    await page.getByRole('button', { name: 'Reference this issue' }).click();
    await page.goto(page.url());
    await expect(page.getByRole('link', { name: 'ENG-9' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove reference' }).last().click();
    await expect(page).toHaveURL(/issue_outcome=unlinked/);
    await page.goto(page.url());
    await expect(page.getByRole('link', { name: 'ENG-9' })).toHaveCount(0);
  });
});
