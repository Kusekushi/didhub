import { test, expect } from '@playwright/test';

test.describe('Alters UI flows', () => {
  test('register, login and create an alter (owner selection if available)', async ({ page }) => {
    const user = `e2e_playwright_a_${Date.now()}`;
    const pass = 'pw12345';

    const E2E_USER = process.env.E2E_USER || process.env.PLAYWRIGHT_E2E_USER;
    const E2E_PASS = process.env.E2E_PASS || process.env.PLAYWRIGHT_E2E_PASS;
    if (!E2E_USER || !E2E_PASS) throw new Error('E2E_USER and E2E_PASS environment variables must be set to run full e2e tests against a real backend');

    await page.goto('/login');
    const username = page.getByLabel('Username');
    try {
      await username.waitFor({ timeout: 2000 });
    } catch (e) {
      const cred = page.getByRole('button', { name: /username and password/i });
      if ((await cred.count()) > 0) {
        await cred.click();
      }
      await username.waitFor({ timeout: 20000 });
    }
    await username.fill(E2E_USER);
  const password = page.locator('input[name="password"]');
  await password.fill(E2E_PASS);
  await page.locator('form button[type="submit"]').first().click();
  try { await page.waitForNavigation({ timeout: 5000 }); } catch {}

    await page.goto('/did-system/1');
    await page.waitForSelector('text=Alters', { timeout: 15000 });
    await page.getByRole('tab', { name: 'Alters' }).click();
    await page.getByRole('button', { name: /create alter/i }).click();

    await page.getByLabel('Name').fill('Playwright E2E Alter');

    const ownerSelect = page.locator('select[name="owner_user_id"]');
    if (await ownerSelect.count() > 0) {
      await ownerSelect.selectOption({ index: 1 }).catch(() => {});
    }

    // Click create and wait for the create POST to complete. Then wait for the list refresh (GET).
    const dialogCreateButton = page.locator('[role="dialog"] button:has-text("Create")');
    await dialogCreateButton.waitFor({ timeout: 10000 });

    // Try to wait for the POST; if it doesn't happen promptly, we'll fall back to reloading the page
    const waitForCreate = page.waitForResponse((res) =>
      res.url().includes('/api/alters') && res.request().method() === 'POST' && (res.status() === 201 || res.status() === 200),
    );

    await Promise.all([waitForCreate, dialogCreateButton.click()]);

    // Optionally wait for a list GET to happen (client may refresh). If not observed, the parent's onCreated
    // handler is awaited by the dialog so the UI should already be updated.
    try {
      await page.waitForResponse((res) => res.url().includes('/api/alters') && res.request().method() === 'GET' && res.status() === 200, {
        timeout: 20000,
      });
    } catch (e) {
      // ignore — rely on the parent refresh guarantee implemented in the frontend
    }

    // Finally, assert the created alter appears in the list (give a generous timeout for UI update)
    await expect(page.locator('text=Playwright E2E Alter')).toBeVisible({ timeout: 30000 });
  });
});
