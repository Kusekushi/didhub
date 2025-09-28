import { createShortLink } from '@didhub/api-client';

/**
 * Hook for handling group share link creation
 */
export function useGroupShare() {
  const createShareLink = async (
    groupId: number | string,
    setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void
  ) => {
    try {
      const r = await createShortLink('group', groupId).catch(() => null);
      if (!r || (!r.token && !r.url)) {
        throw new Error(r && r.error ? String(r.error) : 'failed to create share link');
      }

      const path = r.url || `/s/${r.token}`;
      const url = path.startsWith('http')
        ? path
        : window.location.origin.replace(/:\d+$/, '') + path;

      await navigator.clipboard.writeText(url);
      setSnack({ open: true, message: 'Share link copied', severity: 'success' });
    } catch (e) {
      setSnack({
        open: true,
        message: String(e?.message || e || 'Failed to create share link'),
        severity: 'error',
      });
    }
  };

  return { createShareLink };
}