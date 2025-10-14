import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loginWithUI, logoutFromApp, requireAdminCredentials, waitForSnackbar } from './helpers';

const ADMIN = requireAdminCredentials();
// A tiny 1x1 GIF (very small, widely supported) to avoid PNG decoding/CRC issues on some builds
// 1x1 transparent GIF
const AVATAR_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

test.describe('User settings flows', () => {
  test('allows user to update theme preferences and persist them', async ({ page }) => {
    await loginWithUI(page, ADMIN.username, ADMIN.password);
    await page.goto('/user-settings');

    // Switch to dark mode explicitly
    const darkButton = page.getByRole('button', { name: 'Dark' });
    await darkButton.click({ timeout: 10000 });

    // Update density to compact
    await page.getByRole('button', { name: 'Compact' }).click();

    // Wait for settings to persist in localStorage
    await page.waitForFunction(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('didhub_theme_v2'));
      if (!key) return false;
      try {
        const payload = JSON.parse(localStorage.getItem(key) ?? '{}');
        return payload?.settings?.mode === 'dark' && payload?.settings?.density === 'compact';
      } catch {
        return false;
      }
    });

    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('didhub_theme_v2'));
      return key ? JSON.parse(localStorage.getItem(key) ?? 'null') : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.settings.mode).toBe('dark');
    expect(stored.settings.density).toBe('compact');

    await logoutFromApp(page);
  });

  test('allows user to upload and remove an avatar image', async ({ page }) => {
    await loginWithUI(page, ADMIN.username, ADMIN.password);
    await page.goto('/user-settings');
    const initialSrc = await page.locator('img[alt="Account"]').evaluate((img) => (img as HTMLImageElement).src);

  const tmpFile = path.join(os.tmpdir(), `didhub-avatar-${Date.now()}.gif`);
    await fs.promises.writeFile(tmpFile, Buffer.from(AVATAR_BASE64, 'base64'));

    try {
      const fileInput = page.locator('input[type="file"][accept^="image/"]');
      // Ensure the temp file was written correctly before uploading
      const stat = await fs.promises.stat(tmpFile);
      if (!stat || stat.size === 0) throw new Error(`Avatar temp file is empty: ${tmpFile}`);

      // The file input is visually hidden; set files directly without waiting for visibility
      await fileInput.setInputFiles(tmpFile);
      await expect(page.getByRole('button', { name: 'Upload avatar' })).toBeVisible({ timeout: 15000 });

      // Click upload and wait for the server response so we can fail fast if the image is rejected
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/me/avatar') && r.request().method() === 'POST', {
          timeout: 15000,
        }),
        page.getByRole('button', { name: 'Upload avatar' }).click(),
      ]);

      // Expect success HTTP status (200..399)
      const status = resp.status();
      if (status < 200 || status >= 400) {
        // Attach response body for debugging
        const text = await resp.text().catch(() => '<no body>');
        throw new Error(`Avatar upload failed: status=${status} body=${text}`);
      }

      // Parse the server response body to obtain the stored filename and poll for it
      const body = await resp.json().catch(() => ({} as any));
      const saved = body?.avatar;
      if (!saved) throw new Error('Avatar upload response missing avatar filename: ' + JSON.stringify(body));

  const uploadedUrlFragment = `/uploads/${saved}`;
  let newSrc = '';
      // Poll for the image src to include the uploaded filename (avoid fragile heuristics)
      let found = false;
      try {
        await page.waitForFunction((frag) => {
          const img = document.querySelector('img[alt="Account"]') as HTMLImageElement | null;
          return img && img.src.includes(frag);
        }, uploadedUrlFragment, { timeout: 15000 });
        found = true;
      } catch (e) {
        // try a browser-context server-side check by using the page to fetch /api/me with the stored JWT
        try {
          const meJson = await page.evaluate(async (savedFilename) => {
            try {
              const token = localStorage.getItem('didhub_jwt');
              if (!token) return null;
              const resp = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
              if (!resp.ok) return null;
              return await resp.json();
            } catch (e) {
              return null;
            }
          }, saved);
          if (meJson?.avatar && meJson.avatar === saved) found = true;
        } catch (e2) {
          // ignore
        }
      }
      if (!found) {
        // last resort: reload and check DOM one more time
        await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
        newSrc = await page.locator('img[alt="Account"]').evaluate((img) => (img as HTMLImageElement).src).catch(() => '');
        if (!newSrc.includes(uploadedUrlFragment)) throw new Error('Uploaded avatar was not visible after upload and reload');
      }

      await expect(page.getByRole('button', { name: 'Remove avatar' })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Remove avatar' }).click();
      await page.waitForFunction((previous) => {
        const img = document.querySelector('img[alt="Account"]') as HTMLImageElement | null;
        return img ? img.src !== previous : true;
      }, newSrc);
      await waitForSnackbar(page, /Avatar removed|Avatar deleted|Avatar updated|Avatar delete/i, 20000).catch(() => {});
    } finally {
      await fs.promises.unlink(tmpFile).catch(() => {});
    }

    await logoutFromApp(page);
  });
});
