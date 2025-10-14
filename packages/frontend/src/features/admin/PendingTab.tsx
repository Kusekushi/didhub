import React, { useState, useEffect } from 'react';
import { Typography, List, ListItem, ListItemText, Button, Stack } from '@mui/material';
import * as adminService from '../../services/adminService';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

export default function PendingTab() {
  const [pendingRegs, setPendingRegs] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadPendingRegistrations();
  }, []);

  async function loadPendingRegistrations() {
    setLoadingPending(true);
    try {
      const pageResult = await adminService.listUsers({ page: 1, per_page: 100, is_approved: "0" });
      const items = (pageResult && (pageResult as any).items) ?? [];
      setPendingRegs(items);
    } catch {
      setPendingRegs([]);
    } finally {
      setLoadingPending(false);
    }
  }

  const handleApprove = async (user: { id: string; username: string }) => {
      try {
      await adminService.updateUser(user.id, { is_approved: true });
      setSnack({ open: true, message: `Approved ${user.username}`, severity: 'success' });
      loadPendingRegistrations();
      // Refresh system requests
      try {
        await adminService.getSystemRequests();
      } catch (e) {
        // ignore
      }
    } catch (e) {
      setSnack({ open: true, message: String(e || 'Failed'), severity: 'error' });
    }
  };

  const handleReject = async (user: { id: string; username: string }) => {
      try {
      await adminService.updateUser(user.id, { is_approved: false });
      setSnack({ open: true, message: `Rejected ${user.username}`, severity: 'info' });
      loadPendingRegistrations();
    } catch (e) {
      setSnack({ open: true, message: String(e || 'Failed'), severity: 'error' });
    }
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>
        Pending registrations
      </Typography>
      {pendingRegs.length === 0 && (
        <Typography>{loadingPending ? 'Loading...' : 'No pending registrations.'}</Typography>
      )}
      <List>
        {pendingRegs.map((u) => (
          <ListItem
            key={u.id}
            sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}
            secondaryAction={
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" onClick={() => handleApprove(u)}>
                  Approve
                </Button>
                <Button variant="outlined" size="small" color="error" onClick={() => handleReject(u)}>
                  Reject
                </Button>
              </Stack>
            }
          >
            <ListItemText primary={u.username} secondary={u.created_at} />
          </ListItem>
        ))}
      </List>
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
