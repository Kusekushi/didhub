import React from 'react';
import { IconButton } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { createShortLink } from '@didhub/api-client';
import { useSettings } from '../contexts/SettingsContext';
import { SnackbarMessage } from './NotificationSnackbar';

export interface ShareButtonInlineProps {
  id: number | string;
  setSnack: (snack: SnackbarMessage) => void;
}

export default function ShareButtonInline(props: ShareButtonInlineProps) {
  const settings = useSettings();
  if (!settings.shortLinksEnabled) return null;
  const doShare = async () => {
    if (!settings.loaded) return props.setSnack({ open: true, message: 'Settings not loaded', severity: 'error' });
    if (!settings.shortLinksEnabled)
      return props.setSnack({ open: true, message: 'Short links disabled', severity: 'error' });
    try {
      const resp = await createShortLink('alter', props.id).catch(() => null);
      if (!resp || (!resp.token && !resp.url)) throw new Error(resp && resp.error ? String(resp.error) : 'failed');
      const path = resp.url || `/s/${resp.token}`;
      const url = path.startsWith('http') ? path : window.location.origin.replace(/:\d+$/, '') + path;
      await navigator.clipboard.writeText(url);
      props.setSnack({ open: true, message: 'Share link copied', severity: 'success' });
    } catch (e) {
      props.setSnack({
        open: true,
        message: String(e?.message || e || 'Failed to create share link'),
        severity: 'error',
      });
    }
  };
  return (
    <IconButton size="small" onClick={doShare}>
      <ShareIcon fontSize="small" />
    </IconButton>
  );
}
