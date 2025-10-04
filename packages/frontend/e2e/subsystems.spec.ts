import { test, expect } from '@playwright/test';

test.describe('Subsystems UI flows', () => {
  test('register, login and create a subsystem (owner selection if available)', async ({ page }) => {
    const user = `e2e_playwright_s_${Date.now()}`;
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
    await page.getByRole('tab', { name: 'Subsystems' }).click();
    await page.getByRole('button', { name: /create subsystem/i }).click();

    await page.getByLabel('Name').fill('Playwright E2E Subsystem');

    const ownerSelect = page.locator('select[name="owner_user_id"]');
    if (await ownerSelect.count() > 0) {
      await ownerSelect.selectOption({ index: 1 }).catch(() => {});
    }

    await page.getByRole('button', { name: /create/i }).click();
  await expect(page.locator('text=Playwright E2E Subsystem')).toBeVisible({ timeout: 15000 });
  });
});
