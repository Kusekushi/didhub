import React, { useState } from 'react';
import { Typography, Stack, Button } from '@mui/material';
import { apiClient } from '@didhub/api-client';
import AuditLogPanel from './AuditLogPanel';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { AlertColor } from '@mui/material';

export interface AuditTabProps {
  setAdminMsg: (msg: { open: boolean; text: string; severity: AlertColor }) => void;
}

export default function AuditTab(props: AuditTabProps) {
  const [confirmClearAudit, setConfirmClearAudit] = useState(false);
  const [auditReloadCounter, setAuditReloadCounter] = useState(0);

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
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'admin_audit.csv';
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } else {
              props.setAdminMsg({ open: true, text: 'Export failed', severity: 'error' });
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
              props.setAdminMsg({ open: true, text: r.message || 'Cleared audit logs', severity: 'success' });
              setAuditReloadCounter((c) => c + 1);
            } else {
              props.setAdminMsg({ open: true, text: 'Failed to clear', severity: 'error' });
            }
          } catch (e) {
            props.setAdminMsg({ open: true, text: String(e || 'Failed'), severity: 'error' });
          } finally {
            setConfirmClearAudit(false);
          }
        }}
      />
    </>
  );
}
