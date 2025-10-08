import React, { useState, useEffect } from 'react';
import { Typography, List, ListItem, ListItemText, Button, Stack } from '@mui/material';
import { apiClient } from '@didhub/api-client';
import type { AlertColor } from '@mui/material';
import NotificationSnackbar from '../NotificationSnackbar';

export interface SystemRequest {
  id: number;
  user_id: number;
  username: string;
  status: string;
  created_at: string;
}

export default function SystemRequestsTab() {
  const [sysRequests, setSysRequests] = useState<SystemRequest[]>([]);
  const [snack, setSnack] = useState<{ open: boolean; text: string; severity: AlertColor }>({ open: false, text: '', severity: 'info' });

  // Load system requests on mount
  useEffect(() => {
    const loadSystemRequests = async () => {
      try {
        const sr = await apiClient.admin.listSystemRequests();
        setSysRequests(sr || []);
      } catch (e) {
        setSnack({ open: true, text: `Failed to load system requests: ${e}`, severity: 'error' });
      }
    };
    loadSystemRequests();
  }, []);

  const handleSetRequestStatus = async (id: number, status: 'approved' | 'rejected') => {
    try {
      const result = await apiClient.admin.decideSystemRequest(id, status);
      if (result.success !== false) {
        setSnack({
          open: true,
          text: result.message ?? `Request ${status}`,
          severity: 'success',
        });
        // Refresh the list
        const sr = await apiClient.admin.listSystemRequests();
        setSysRequests(sr || []);
      } else {
        setSnack({
          open: true,
          text: result.message ?? 'Failed to update request status',
          severity: 'error',
        });
      }
    } catch (e) {
      setSnack({ open: true, text: String(e || 'Failed'), severity: 'error' });
    }
  };
  return (
    <>
      <Typography variant="h5" gutterBottom>
        System account requests
      </Typography>
      {sysRequests.length === 0 && <Typography>No pending requests.</Typography>}
      <List>
        {sysRequests.map((r) => (
          <ListItem
            key={r.id}
            sx={{ border: '1px solid #eee', mb: 1, borderRadius: 1 }}
            secondaryAction={
              <Stack direction="row" spacing={1}>
                <Button variant="contained" size="small" onClick={() => handleSetRequestStatus(r.id, 'approved')}>
                  Approve
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => handleSetRequestStatus(r.id, 'rejected')}
                >
                  Reject
                </Button>
              </Stack>
            }
          >
            <ListItemText primary={r.username} secondary={`Status: ${r.status} — ${r.created_at}`} />
          </ListItem>
        ))}
      </List>
      <NotificationSnackbar
        open={snack.open}
        message={snack.text}
        severity={snack.severity}
        onClose={() => setSnack({ ...snack, open: false })}
      />
    </>
  );
}
