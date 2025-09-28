import { test, expect } from '@playwright/test';

test('login page loads and shows username field', async ({ page }) => {
  await page.goto('/login');
  // Wait for the username input label rendered by Toolpad SignInPage
  await expect(page.getByLabel('Username')).toBeVisible();
});
