import React from 'react';
import { Typography, Paper, TextField, Stack, Button, FormControlLabel, Switch } from '@mui/material';
import { reloadUploadDir } from '@didhub/api-client';

interface SettingsTabProps {
  webhook: string;
  uploadDirTtlSecs: string;
  discordDigestEnabled: boolean;
  emailEnabled: boolean;
  shortLinksEnabled: boolean;
  autoUpdateEnabled: boolean;
  status: string;
  onWebhookChange: (value: string) => void;
  onUploadDirTtlChange: (value: string) => void;
  onDiscordDigestChange: (checked: boolean) => void;
  onEmailEnabledChange: (checked: boolean) => void;
  onShortLinksChange: (checked: boolean) => void;
  onAutoUpdateChange: (checked: boolean) => void;
  onSave: () => void;
  onStatusChange: (status: string) => void;
  onMessage: (message: { open: boolean; text: string; severity: 'success' | 'error' }) => void;
}

export default function SettingsTab({
  webhook,
  uploadDirTtlSecs,
  discordDigestEnabled,
  emailEnabled,
  shortLinksEnabled,
  autoUpdateEnabled,
  status,
  onWebhookChange,
  onUploadDirTtlChange,
  onDiscordDigestChange,
  onEmailEnabledChange,
  onShortLinksChange,
  onAutoUpdateChange,
  onSave,
  onStatusChange,
  onMessage,
}: SettingsTabProps) {
  const handleReloadUploadDir = async () => {
    try {
      onStatusChange('Reloading upload dir...');
      const r = await reloadUploadDir();
      const msg = r && r.dir ? `Reloaded upload dir: ${r.dir}` : 'Reloaded upload dir';
      onStatusChange(msg);
      onMessage({ open: true, text: msg, severity: 'success' });
    } catch (e) {
      onStatusChange('Reload failed');
      onMessage({ open: true, text: 'Reload failed', severity: 'error' });
    } finally {
      setTimeout(() => onStatusChange(''), 2500);
    }
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Discord webhook URL
        </Typography>
        <TextField
          fullWidth
          value={webhook}
          onChange={(e) => onWebhookChange(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
        />
        <TextField
          sx={{ mt: 2 }}
          size="small"
          fullWidth
          value={uploadDirTtlSecs}
          onChange={(e) => onUploadDirTtlChange(e.target.value)}
          placeholder="Upload dir cache TTL (seconds)"
          label="Upload Dir Cache TTL"
          helperText="In-process cache duration for dynamic upload directory path"
        />
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch checked={discordDigestEnabled} onChange={(e) => onDiscordDigestChange(e.target.checked)} />
            }
            label="Enable Discord digest"
          />
          <FormControlLabel
            control={<Switch checked={emailEnabled} onChange={(e) => onEmailEnabledChange(e.target.checked)} />}
            label="Enable email features"
          />
          <FormControlLabel
            control={<Switch checked={shortLinksEnabled} onChange={(e) => onShortLinksChange(e.target.checked)} />}
            label="Enable short links"
          />
          <FormControlLabel
            control={<Switch checked={autoUpdateEnabled} onChange={(e) => onAutoUpdateChange(e.target.checked)} />}
            label="Enable auto updates"
          />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
          <Button variant="contained" onClick={onSave}>
            Save
          </Button>
          <Button variant="outlined" onClick={handleReloadUploadDir}>
            Reload Upload Dir
          </Button>
          <Typography variant="body2">{status}</Typography>
        </Stack>
      </Paper>
    </>
  );
}
