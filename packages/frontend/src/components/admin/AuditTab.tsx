import React, { useState } from 'react';
import { Typography, Stack, Button } from '@mui/material';
import { exportAdminAuditCsv, clearAuditLogs } from '@didhub/api-client';
import AuditLogPanel from './AuditLogPanel';
import DeleteConfirmDialog from '../../components/DeleteConfirmDialog';
import type { AlertColor } from '@mui/material';

interface AuditTabProps {
  setAdminMsg: (msg: { open: boolean; text: string; severity: AlertColor }) => void;
}

export default function AuditTab({ setAdminMsg }: AuditTabProps) {
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
            const r = await exportAdminAuditCsv();
            if (r && (r.text || r.json)) {
              const txt = r.text || (typeof r.json === 'string' ? r.json : JSON.stringify(r.json || ''));
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
              setAdminMsg({ open: true, text: 'Export failed', severity: 'error' });
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
      <DeleteConfirmDialog
        open={confirmClearAudit}
        title="Clear audit logs"
        label="all admin audit logs"
        onCancel={() => setConfirmClearAudit(false)}
        onConfirm={async () => {
          try {
            const r = await clearAuditLogs();
            if (r && r.status === 'ok') {
              setAdminMsg({ open: true, text: 'Cleared audit logs', severity: 'success' });
              setAuditReloadCounter((c) => c + 1);
            } else {
              setAdminMsg({ open: true, text: 'Failed to clear', severity: 'error' });
            }
          } catch (e) {
            setAdminMsg({ open: true, text: String(e || 'Failed'), severity: 'error' });
          } finally {
            setConfirmClearAudit(false);
          }
        }}
      />
    </>
  );
}
