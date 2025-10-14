import { expect, Page } from '@playwright/test';

export interface Credentials {
  username: string;
  password: string;
}

function resolveEnv(name: string): string | undefined {
  return process.env[name] || process.env[`PLAYWRIGHT_${name}`];
}

export function requireAdminCredentials(): Credentials {
  const username = resolveEnv('E2E_USER');
  const password = resolveEnv('E2E_PASS');
  if (!username || !password) {
    throw new Error('E2E_USER and E2E_PASS environment variables must be set to run these E2E tests');
  }
  return { username, password };
}

export async function openCredentialsForm(page: Page): Promise<void> {
  // Accept multiple possible selectors for username inputs so the helper
  // works whether the form exposes labelled inputs or uses placeholders/ids.
  const usernameSelectors = [
    'input[name="username"]',
    'input[name="login"]',
    'input[id*="username"]',
    'input[placeholder*="Username"]',
    'input[aria-label*="Username"]',
  ].join(',');

  const usernameField = page.locator(usernameSelectors).first();
  try {
    await usernameField.waitFor({ timeout: 2000 });
    return;
  } catch (err) {
    // Some setups show OIDC buttons and require clicking a "Username and Password"
    // or "Credentials" toggle. Match more broadly for these buttons.
    const credButton = page.getByRole('button', { name: /username|credentials|password/i });
    if ((await credButton.count()) > 0) {
      await credButton.first().click();
      await usernameField.waitFor({ timeout: 20000 });
      return;
    }
    // Last attempt: maybe the inputs are present but not visible immediately;
    // try waiting a bit longer before giving up so transient client/server
    // timing doesn't break tests.
    await usernameField.waitFor({ timeout: 10000 });
  }
}

export async function loginWithUI(page: Page, username: string, password: string): Promise<void> {
  const retries = 2;
  const retryDelay = 1000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await page.waitForTimeout(retryDelay);

    await page.goto('/login');
    await openCredentialsForm(page);

    // Prefer input[name=...] locators because getByLabel can fail when labels
    // are not rendered or are wrapped differently.
    const usernameInput = page.locator('input[name="username"], input[name="login"], input[id*="username"], input[placeholder*="Username"], input[aria-label*="Username"]').first();
    const passwordInput = page.locator('input[name="password"], input[id*="password"], input[placeholder*="Password"], input[aria-label*="Password"]').first();

    await usernameInput.fill(username);
    await passwordInput.fill(password);

    const submitButton = page.locator('form button[type="submit"]').first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {}),
      submitButton.click(),
    ]);

    // Wait for one of several reliable post-login indicators.
    try {
      await Promise.race([
        page.waitForSelector('text=Welcome back!', { timeout: 8000 }),
        page.waitForSelector('[data-test-id="app-landing"]', { timeout: 8000 }),
        page.waitForSelector('img[alt="Account"]', { timeout: 8000 }),
      ]);
      return; // successful login
    } catch (err) {
      if (attempt === retries) throw err; // rethrow on final attempt
      // else loop to retry (handles transient 429s / network blips)
    }
  }
}

export async function logoutFromApp(page: Page): Promise<void> {
  const avatarButton = page.locator('img[alt="Account"]').first();
  await avatarButton.waitFor({ timeout: 15000 });
  await avatarButton.click();

  const logoutItem = page.getByRole('menuitem', { name: /logout/i });
  await logoutItem.waitFor({ timeout: 10000 });
  await Promise.all([
    page.waitForURL(/\/login/i, { timeout: 15000 }).catch(() => {}),
    logoutItem.click(),
  ]);
  await expect(page.locator('h5:has-text("Sign in")')).toBeVisible({ timeout: 15000 });
}

export function uniqueName(prefix: string): string {
  const random = Math.floor(Math.random() * 1_000_000);
  return `${prefix}_${Date.now()}_${random}`;
}

export async function waitForSnackbar(page: Page, text: RegExp | string, timeout = 15000): Promise<void> {
  await expect(page.locator('[role="alertdialog"], [role="alert"]').filter({ hasText: text })).toBeVisible({ timeout });
}
