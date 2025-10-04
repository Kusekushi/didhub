import { test, expect } from '@playwright/test';

test('app renders and shows branding', async ({ page }) => {
  await page.goto('/');
  // Wait for the main branding to render
  await page.waitForSelector('text=DIDHub', { timeout: 15000 });
  await expect(page.locator('text=DIDHub')).toBeVisible();
});
