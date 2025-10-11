import React, { useState, useEffect } from 'react';
import { Typography, Paper, TextField, Stack, Button, FormControlLabel, Switch } from '@mui/material';
import { apiClient, SETTINGS as SETTINGS_KEYS } from '@didhub/api-client';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

export default function SettingsTab() {
  const [webhook, setWebhook] = useState('');
  const [uploadDirTtlSecs, setUploadDirTtlSecs] = useState('3600');
  const [discordDigestEnabled, setDiscordDigestEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [status, setStatus] = useState('');
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await apiClient.admin.get_settings();
        if (s) {
          setWebhook(String(s[SETTINGS_KEYS.DISCORD_WEBHOOK_URL] || ''));
          setUploadDirTtlSecs(
            s['uploads.upload_dir_cache.ttl_secs'] ? String(s['uploads.upload_dir_cache.ttl_secs']) : '3600',
          );
          setDiscordDigestEnabled(
            s[SETTINGS_KEYS.DISCORD_DIGEST_ENABLED] === '1' || s[SETTINGS_KEYS.DISCORD_DIGEST_ENABLED] === true,
          );
          setEmailEnabled(s[SETTINGS_KEYS.EMAIL_ENABLED] === '1' || s[SETTINGS_KEYS.EMAIL_ENABLED] === true);
          setAutoUpdateEnabled(s['auto_update_enabled'] === '1' || s['auto_update_enabled'] === true);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleReloadUploadDir = async () => {
    try {
      setStatus('Reloading upload dir...');
      const r = await apiClient.admin.post_admin_reload_upload_dir();
      const msg = r && r.dir ? `Reloaded upload dir: ${r.dir}` : 'Reloaded upload dir';
      setStatus(msg);
      setSnack({ open: true, message: msg, severity: 'success' });
    } catch (e) {
      setStatus('Reload failed');
      setSnack({ open: true, message: 'Reload failed', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 2500);
    }
  };

  const handleSave = async () => {
    try {
      setStatus('Saving...');
      await apiClient.admin.put_settings({
        [SETTINGS_KEYS.DISCORD_WEBHOOK_URL]: webhook || null,
        [SETTINGS_KEYS.DISCORD_DIGEST_ENABLED]: discordDigestEnabled ? '1' : '0',
        [SETTINGS_KEYS.EMAIL_ENABLED]: emailEnabled ? '1' : '0',
        ['auto_update_enabled']: autoUpdateEnabled ? '1' : '0',
        ['uploads.upload_dir_cache.ttl_secs']: uploadDirTtlSecs ? parseInt(uploadDirTtlSecs, 10) : 3600,
      });
      setStatus('Saved');
      setSnack({ open: true, message: 'Settings saved successfully', severity: 'success' });
    } catch (error) {
      setStatus('Save failed');
      setSnack({ open: true, message: 'Failed to save settings', severity: 'error' });
    } finally {
      setTimeout(() => setStatus(''), 2500);
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
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
        />
        <TextField
          sx={{ mt: 2 }}
          size="small"
          fullWidth
          value={uploadDirTtlSecs}
          onChange={(e) => setUploadDirTtlSecs(e.target.value)}
          placeholder="Upload dir cache TTL (seconds)"
          label="Upload Dir Cache TTL"
          helperText="In-process cache duration for dynamic upload directory path"
        />
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch checked={discordDigestEnabled} onChange={(e) => setDiscordDigestEnabled(e.target.checked)} />
            }
            label="Enable Discord digest"
          />
          <FormControlLabel
            control={<Switch checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />}
            label="Enable email features"
          />
          <FormControlLabel
            control={<Switch checked={autoUpdateEnabled} onChange={(e) => setAutoUpdateEnabled(e.target.checked)} />}
            label="Enable auto updates"
          />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center' }}>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
          <Button variant="outlined" onClick={handleReloadUploadDir}>
            Reload Upload Dir
          </Button>
          <Typography variant="body2">{status}</Typography>
        </Stack>
      </Paper>
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
