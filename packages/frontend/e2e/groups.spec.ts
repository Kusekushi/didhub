import { test, expect } from '@playwright/test';

test.describe('Groups UI flows', () => {
  test('register, login and create a group (owner selection if available)', async ({ page }) => {
    const user = `e2e_playwright_g_${Date.now()}`;
    const pass = 'pw12345';

    // Use real backend: require E2E_USER and E2E_PASS environment variables to be set
    const E2E_USER = process.env.E2E_USER || process.env.PLAYWRIGHT_E2E_USER;
    const E2E_PASS = process.env.E2E_PASS || process.env.PLAYWRIGHT_E2E_PASS;
    if (!E2E_USER || !E2E_PASS)
      throw new Error(
        'E2E_USER and E2E_PASS environment variables must be set to run full e2e tests against a real backend',
      );

    // Login via the real login page
    await page.goto('/login');
    const username = page.getByLabel('Username');
    try {
      await username.waitFor({ timeout: 2000 });
    } catch (e) {
      // If the credentials provider is shown as a button, click it to reveal the form
      const cred = page.getByRole('button', { name: /username and password/i });
      if ((await cred.count()) > 0) {
        await cred.click();
      }
      await username.waitFor({ timeout: 20000 });
    }
    await username.fill(E2E_USER);
    const password = page.locator('input[name="password"]');
    await password.fill(E2E_PASS);
    // Submit the sign-in form by clicking the form's submit button
    await page.locator('form button[type="submit"]').first().click();
    // Wait briefly for any client-side redirect
    try {
      await page.waitForNavigation({ timeout: 5000 });
    } catch {}

    // Navigate to the DID system view for user 1 and switch to the Groups tab
    await page.goto('/did-system/1');
    await page.waitForSelector('text=Alters', { timeout: 15000 });
    await page.getByRole('tab', { name: 'Groups' }).click();

    // Open create dialog in the Groups tab
    await page.getByRole('button', { name: /create group/i }).click();

    await page.getByLabel('Name').fill('Playwright E2E Group');

    // If an owner selector exists (admin flow), pick the first other user
    const ownerSelect = page.locator('select[name="owner_user_id"]');
    if ((await ownerSelect.count()) > 0) {
      await ownerSelect.selectOption({ index: 1 }).catch(() => {});
    }

    await page.getByRole('button', { name: /create/i }).click();

    // After create, the group's name should appear in the listing
    await expect(page.locator('text=Playwright E2E Group')).toBeVisible({ timeout: 15000 });
  });
});
