import React from 'react';
import { Typography, List, ListItem, ListItemText, Button, Stack } from '@mui/material';

interface SystemRequest {
  id: number;
  user_id: number;
  username: string;
  status: string;
  created_at: string;
}

interface SystemRequestsTabProps {
  sysRequests: SystemRequest[];
  onSetRequestStatus: (id: number, status: 'approved' | 'rejected') => void;
}

export default function SystemRequestsTab({ sysRequests, onSetRequestStatus }: SystemRequestsTabProps) {
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
                <Button variant="contained" size="small" onClick={() => onSetRequestStatus(r.id, 'approved')}>
                  Approve
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  onClick={() => onSetRequestStatus(r.id, 'rejected')}
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
    </>
  );
}
