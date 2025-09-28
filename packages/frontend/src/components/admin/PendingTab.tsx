import React from 'react';
import { Typography, List, ListItem, ListItemText, Button, Stack } from '@mui/material';
import { updateUser, listSystemRequests } from '@didhub/api-client';

interface PendingTabProps {
  pendingRegs: Array<{ id: number; username: string; created_at: string }>;
  loadingPending: boolean;
  onUserUpdate: () => void;
  onSystemRequestsUpdate: (requests: any[]) => void;
  onMessage: (message: { open: boolean; text: string; severity: 'success' | 'error' | 'info' }) => void;
}

export default function PendingTab({
  pendingRegs,
  loadingPending,
  onUserUpdate,
  onSystemRequestsUpdate,
  onMessage,
}: PendingTabProps) {
  const handleApprove = async (user: { id: number; username: string }) => {
    try {
      await updateUser(user.id, { is_approved: true });
      onMessage({ open: true, text: `Approved ${user.username}`, severity: 'success' });
      onUserUpdate();
      const sr = await listSystemRequests();
      onSystemRequestsUpdate((sr && sr.items) || []);
    } catch (e) {
      onMessage({ open: true, text: String(e || 'Failed'), severity: 'error' });
    }
  };

  const handleReject = async (user: { id: number; username: string }) => {
    try {
      await updateUser(user.id, { is_approved: false });
      onMessage({ open: true, text: `Rejected ${user.username}`, severity: 'info' });
      onUserUpdate();
    } catch (e) {
      onMessage({ open: true, text: String(e || 'Failed'), severity: 'error' });
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
    </>
  );
}
