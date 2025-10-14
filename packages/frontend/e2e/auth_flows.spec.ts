import { test, expect } from '@playwright/test';
import { loginWithUI, logoutFromApp, requireAdminCredentials, uniqueName, waitForSnackbar } from './helpers';

const ADMIN = requireAdminCredentials();

function generateUserCredentials(prefix: string) {
  const username = uniqueName(prefix);
  const password = `Pw!${Math.floor(Math.random() * 1_000_000)}a`;
  return { username, password };
}

test.describe('Authentication flows', () => {
  test('allows admin user to login and logout via UI', async ({ page }) => {
    await loginWithUI(page, ADMIN.username, ADMIN.password);
    await expect(page.locator('text=Welcome back!')).toBeVisible();
    await logoutFromApp(page);
  });

  test('supports password change and re-authentication for newly created user', async ({ page }) => {
    // Step 1: login as admin and create a dedicated user via admin panel
    await loginWithUI(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /^Dashboard$/ })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /^Users$/ }).click();

    const userCreds = generateUserCredentials('pwchange');
    await page.getByRole('button', { name: /create user/i }).click();
    const dialog = page.locator('div[role="dialog"]').filter({ hasText: 'Create New User' });
    await dialog.waitFor({ timeout: 15000 });
    await dialog.getByLabel('Username').fill(userCreds.username);
    await dialog.getByLabel('Password').fill(userCreds.password);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await waitForSnackbar(page, /User created successfully/i);

    // Log out admin
    await logoutFromApp(page);

    // Step 2: login as the newly created user
    await loginWithUI(page, userCreds.username, userCreds.password);
    await expect(page.locator('text=Welcome back!')).toBeVisible();

    // Step 3: change password via user settings
    await page.goto('/user-settings');
    const newPassword = `${userCreds.password}X!`; // ensure different
    await page.getByLabel('Current password').fill(userCreds.password);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await waitForSnackbar(page, /Password changed/i);

    // Step 4: logout and login with the new password
    await logoutFromApp(page);
    await loginWithUI(page, userCreds.username, newPassword);
    await expect(page.locator('text=Welcome back!')).toBeVisible();
  });

  test('supports user registration and approval workflow', async ({ page }) => {
    // Step 1: register a brand new user
    const pendingUser = generateUserCredentials('pending');
    await page.goto('/register');
    await page.getByLabel('Username').fill(pendingUser.username);
    // Some layouts use different labeling; try a few fallbacks for the password field
    const passLocators = [
      page.getByLabel('Password', { exact: true }),
      page.getByLabel('Password'),
      page.getByPlaceholder('Password'),
      page.locator('input[type="password"]').nth(0),
      page.locator('input[name="password"]'),
      page.locator('input[id*="password"]'),
    ];
    let filled = false;
    for (const l of passLocators) {
      try {
        await l.fill(pendingUser.password);
        filled = true;
        break;
      } catch (e) {
        // try next after a short wait in case the form is rendering
        await page.waitForTimeout(250);
      }
    }
    if (!filled) throw new Error('Could not find password input on register page');
    // Confirm password field may be labelled differently in some layouts
    const confirmLocators = [
      page.getByLabel('Confirm Password'),
      page.getByLabel('Confirm password'),
      page.getByPlaceholder('Confirm Password'),
      page.locator('input[name="confirm_password"]'),
      page.locator('input[name="password_confirm"]'),
      page.locator('input[type="password"]').nth(1),
    ];
    let confirmFilled = false;
    for (const c of confirmLocators) {
      try {
        await c.fill(pendingUser.password);
        confirmFilled = true;
        break;
      } catch (e) {
        // try next
      }
    }
    if (!confirmFilled) throw new Error('Could not find confirm password input on register page');
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Registration redirects to login
    await expect(page).toHaveURL(/\/login$/);

    // Step 2: login as admin and approve the user in the pending list
    await loginWithUI(page, ADMIN.username, ADMIN.password);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /^Dashboard$/ })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Pending' }).click();

    const pendingListItem = page.locator('li').filter({ hasText: pendingUser.username }).first();
    await pendingListItem.waitFor({ timeout: 20000 });
    await pendingListItem.getByRole('button', { name: 'Approve' }).click();
    await waitForSnackbar(page, new RegExp(`Approved\s+${pendingUser.username}`));

    await logoutFromApp(page);

    // Step 3: login as the newly approved user
    await loginWithUI(page, pendingUser.username, pendingUser.password);
    await expect(page.locator('text=Welcome back!')).toBeVisible();
  });
});
