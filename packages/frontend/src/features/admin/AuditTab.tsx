import React, { useState } from 'react';
import { Typography, Stack, Button } from '@mui/material';
import { apiClient } from '@didhub/api-client';
import AuditLogPanel from './AuditLogPanel';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { downloadBlob } from '../../shared/utils/downloadUtils';

export default function AuditTab() {
  const [confirmClearAudit, setConfirmClearAudit] = useState(false);
  const [auditReloadCounter, setAuditReloadCounter] = useState(0);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Admin audit logs
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={async () => {
            const result = await apiClient.admin.exportAuditCsv();
            if (result.ok && result.content) {
              const txt = result.content;
              const blob = new Blob([txt], { type: 'text/csv' });
              downloadBlob(blob, 'admin_audit');
            } else {
              setSnack({ open: true, message: 'Export failed', severity: 'error' });
            }
          }}
        >
          Export CSV
        </Button>
        <Button variant="outlined" color="error" onClick={() => setConfirmClearAudit(true)}>
          Clear logs
        </Button>
      </Stack>
      <AuditLogPanel reload={auditReloadCounter} />
      <ConfirmDialog
        open={confirmClearAudit}
        title="Clear audit logs"
        label="all admin audit logs"
        onClose={() => setConfirmClearAudit(false)}
        onConfirm={async () => {
          try {
            const r = await apiClient.admin.clearAuditLogs();
            if (r && r.success) {
              setSnack({ open: true, message: r.message || 'Cleared audit logs', severity: 'success' });
              setAuditReloadCounter((c) => c + 1);
            } else {
              setSnack({ open: true, message: 'Failed to clear', severity: 'error' });
            }
          } catch (e) {
            setSnack({ open: true, message: String(e || 'Failed'), severity: 'error' });
          } finally {
            setConfirmClearAudit(false);
          }
        }}
      />
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
