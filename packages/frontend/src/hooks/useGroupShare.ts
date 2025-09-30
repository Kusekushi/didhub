import { apiClient, getShortLinkUrl } from '@didhub/api-client';

/**
 * Hook for handling group share link creation
 */
export function useGroupShare() {
  const createShareLink = async (
    groupId: number | string,
    setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void,
  ) => {
    try {
      const record = await apiClient.shortlinks.create('group', groupId).catch(() => null);
      if (!record) {
        throw new Error('Failed to create share link');
      }

      const url = getShortLinkUrl(record);

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
