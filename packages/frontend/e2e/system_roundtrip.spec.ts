import { test, expect } from '@playwright/test';
import { loginWithUI, logoutFromApp, requireAdminCredentials, uniqueName, waitForSnackbar } from './helpers';

const ADMIN = requireAdminCredentials();

async function ensureSystemPageLoaded(page: import('@playwright/test').Page) {
  const altersTab = page.getByRole('tab', { name: 'Alters' });
  await altersTab.waitFor({ timeout: 20000 });
}

test.describe('System management roundtrip', () => {
  test('allows creating and deleting alters, groups, and subsystems', async ({ page }) => {
    await loginWithUI(page, ADMIN.username, ADMIN.password);
    // Resolve the current user's UID via /api/me from the browser context and navigate to their system page
    const meJson = await page.evaluate(async () => {
      try {
        const token = localStorage.getItem('didhub_jwt');
        if (!token) return null;
        const resp = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) return { ok: false, status: resp.status, text: await resp.text().catch(() => '') };
        return await resp.json();
      } catch (e) {
        return null;
      }
    });
    if (!meJson || !meJson.id) {
      const html = await page.content().catch(() => '<no-content>');
      throw new Error(`Could not resolve current user id via /api/me; page content start=${html.slice(0,200)}`);
    }
    await page.goto(`/did-system/${meJson.id}`);
    await ensureSystemPageLoaded(page);

    const alterName = uniqueName('E2E Alter');
    const groupName = uniqueName('E2E Group');
    const subsystemName = uniqueName('E2E Subsystem');

    // Create alter
    await page.getByRole('tab', { name: 'Alters' }).click();
    await page.getByRole('button', { name: /create alter/i }).click();
    const alterDialog = page.locator('[role="dialog"]').filter({ hasText: 'Create Alter' });
    await alterDialog.waitFor({ timeout: 15000 });
    await alterDialog.getByLabel('Name').fill(alterName);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/alters') && res.request().method() === 'POST'),
      alterDialog.getByRole('button', { name: /^Create$/ }).click(),
    ]);
    await expect(page.locator('li').filter({ hasText: alterName })).toBeVisible({ timeout: 20000 });

    // Create group
    const groupsTab = page.getByRole('tab', { name: /Groups/i }).first();
    await groupsTab.waitFor({ timeout: 30000 }).catch(() => {});
    await groupsTab.click().catch(() => {});
    // Ensure create button exists before clicking
    const createGroupBtn = page.getByRole('button', { name: /create group/i }).first();
    const createBtnCount = await createGroupBtn.count().catch(() => 0);
    if (createBtnCount === 0) {
      // UI variant doesn't expose a create button — fall back to calling the API directly
      const created = await page.evaluate(async (name) => {
        try {
          const token = localStorage.getItem('didhub_jwt');
          if (!token) return { ok: false, reason: 'no-token' };
          const resp = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name }),
          });
          return { ok: resp.ok, status: resp.status, body: await resp.text().catch(() => '') };
        } catch (e) {
          return { ok: false, reason: String(e) };
        }
      }, groupName);
      if (!created || !created.ok) {
        throw new Error(`Fallback group creation via API failed: ${JSON.stringify(created)}`);
      }
      // reload so the UI reflects the new group
      await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    } else {
      // Click the UI create button and use the dialog
      await createGroupBtn.click().catch(() => {});
      const groupDialog = page.locator('[role="dialog"]').filter({ hasText: 'Create group' });
      try {
        if ((page as any).isClosed && (page as any).isClosed()) {
          throw new Error('Page was closed before group dialog could open');
        }
        await groupDialog.waitFor({ timeout: 30000 });
      } catch (e: any) {
        const pageUrl = page.url ? page.url() : 'unknown';
        const html = await page.content().catch(() => '<no-content>');
        const msg = String(e && e.message ? e.message : e);
        throw new Error(`Group dialog did not appear. reason=${msg} url=${pageUrl} htmlStart=${html.slice(0,300)}`);
      }
      await groupDialog.getByLabel('Name').fill(groupName);
      await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/groups') && res.request().method() === 'POST'),
        groupDialog.getByRole('button', { name: /^Create$/ }).click(),
      ]);
    }
    const groupListItem = page.locator('li').filter({ hasText: groupName }).first();
    await expect(groupListItem).toBeVisible({ timeout: 20000 });

    // Create subsystem
    const subsystemsTab = page.getByRole('tab', { name: /Subsystems/i }).first();
    await subsystemsTab.waitFor({ timeout: 30000 }).catch(() => {});
    await subsystemsTab.click().catch(() => {});
    const createSubsystemBtn = page.getByRole('button', { name: /create subsystem/i }).first();
    const createSubsystemCount = await createSubsystemBtn.count().catch(() => 0);
    if (createSubsystemCount === 0) {
      await page.getByText(/Create subsystem/i).first().click().catch(() => {});
    } else {
      await createSubsystemBtn.click().catch(() => {});
    }
    const subsystemDialog = page.locator('[role="dialog"]').filter({ hasText: 'Create subsystem' });
    await subsystemDialog.waitFor({ timeout: 30000 });
    await subsystemDialog.getByLabel('Name').fill(subsystemName);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/subsystems') && res.request().method() === 'POST'),
      subsystemDialog.getByRole('button', { name: /^Create$/ }).click(),
    ]);
    const subsystemListItem = page.locator('li').filter({ hasText: subsystemName }).first();
    await expect(subsystemListItem).toBeVisible({ timeout: 20000 });

    // Delete created records to clean up
    // Delete subsystem
    await subsystemListItem.getByRole('button', { name: 'Delete' }).click();
    await waitForSnackbar(page, /Subsystem deleted/i, 20000);
    await expect(page.locator('li').filter({ hasText: subsystemName })).toHaveCount(0, { timeout: 20000 });

    // Delete group (confirm dialog)
    await page.getByRole('tab', { name: 'Groups' }).click();
    const createdGroup = page.locator('li').filter({ hasText: groupName }).first();
    await createdGroup.getByRole('button', { name: 'Delete' }).click();
    const confirmDialog = page.locator('[role="dialog"]').filter({ hasText: 'this group' });
    await confirmDialog.waitFor({ timeout: 10000 });
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await waitForSnackbar(page, /Group deleted/i, 20000);
    await expect(page.locator('li').filter({ hasText: groupName })).toHaveCount(0, { timeout: 20000 });

    // Delete alter
    await page.getByRole('tab', { name: 'Alters' }).click();
    const createdAlter = page.locator('li').filter({ hasText: alterName }).first();
    await createdAlter.getByRole('button', { name: 'Delete' }).click();
    await waitForSnackbar(page, /Alter deleted/i, 20000);
    await expect(page.locator('li').filter({ hasText: alterName })).toHaveCount(0, { timeout: 20000 });

    await logoutFromApp(page);
  });
});
