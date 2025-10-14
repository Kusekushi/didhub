import React, { useState, useEffect } from 'react';
import { Typography, Paper, Stack, TextField, Button, FormControlLabel, Switch } from '@mui/material';
import * as adminService from '../../services/adminService';
// Local lightweight type for admin view
type OidcProviderAdminView = any;
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

function OidcSecretForm({
  view,
  disabled,
  onSave,
}: {
  view: OidcProviderAdminView;
  disabled: boolean;
  onSave: (cid?: string, secret?: string, enabled?: boolean) => Promise<void>;
}) {
  const [cid, setCid] = useState(view.client_id || '');
  const [cidEdited, setCidEdited] = useState(false);
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(!!view.enabled);
  useEffect(() => {
    setCid(view.client_id || '');
    setEnabled(!!view.enabled);
    setCidEdited(false);
  }, [view.id]);
  return (
    <Stack spacing={2} sx={{ maxWidth: 500 }}>
      <Typography variant="subtitle2">Manage credentials for {view.id}</Typography>
      <TextField
        size="small"
        label="Client ID"
        value={cid}
        onChange={(e) => {
          setCid(e.target.value);
          setCidEdited(true);
        }}
        disabled={disabled}
        helperText={cid && cid.includes('...') ? 'Masked client ID — edit to replace' : ''}
      />
      <TextField
        size="small"
        label="Client Secret"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        type="password"
        disabled={disabled}
        helperText={view.has_client_secret ? 'Secret set (leave blank to keep unchanged)' : 'No secret stored yet'}
      />
      <FormControlLabel
        control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={disabled} />}
        label={enabled ? 'Enabled' : 'Disabled'}
      />
      <Button
        variant="contained"
        disabled={disabled}
        onClick={() => onSave(cidEdited ? cid : undefined, secret.trim() ? secret : undefined, enabled)}
      >
        Save
      </Button>
    </Stack>
  );
}

export default function OidcProvidersTab() {
  const [selectedOidcProvider, setSelectedOidcProvider] = useState<string>('google');
  const [providerAdminView, setProviderAdminView] = useState<OidcProviderAdminView | null>(null);
  const [updatingProvider, setUpdatingProvider] = useState(false);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  return (
    <>
      <Typography variant="h6">OIDC Providers</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <TextField
            select
            SelectProps={{ native: true }}
            label="Provider"
            value={selectedOidcProvider}
            onChange={async (e) => {
              const v = e.target.value;
              setSelectedOidcProvider(v);
              const info = await adminService.getOidcSecret(v);
              setProviderAdminView(info);
            }}
            size="small"
            sx={{ width: 200 }}
          >
            {['google', 'discord', 'github'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </TextField>
          <Button variant="outlined" size="small" onClick={async () => setProviderAdminView(await adminService.getOidcSecret(selectedOidcProvider))}>
            Load
          </Button>
        </Stack>
        {providerAdminView ? (
          <OidcSecretForm
            view={providerAdminView}
            disabled={updatingProvider}
                onSave={async (cid, secret, enabled) => {
              try {
                setUpdatingProvider(true);
                const updated = await adminService.updateOidcSecret(selectedOidcProvider, {
                  client_id: cid || undefined,
                  client_secret: secret || undefined,
                  enabled,
                });
                if (updated) {
                  setProviderAdminView(updated);
                  setSnack({ open: true, message: 'Updated provider', severity: 'success' });
                } else {
                  setSnack({ open: true, message: 'Update failed', severity: 'error' });
                }
              } finally {
                setUpdatingProvider(false);
              }
            }}
          />
        ) : (
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            Select a provider above and click Load.
          </Typography>
        )}
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
