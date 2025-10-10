import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Autocomplete,
  List,
  ListItem,
  ListItemText,
  Divider,
  Pagination,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiClient, type ApiUser, type Subsystem } from '@didhub/api-client';

import { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { useSubsystemCreationState } from '../../shared/hooks/useSubsystemCreationState';
import { useSubsystemsData } from '../../shared/hooks/useSubsystemsData';
import { useAuth } from '../../shared/contexts/AuthContext';
import NotificationSnackbar from '../../components/ui/NotificationSnackbar';

export interface SubsystemsTabProps {
  uid: string;
}

export default function SubsystemsTab({ uid }: SubsystemsTabProps) {
  const nav = useNavigate();
  const { user: me } = useAuth() as { user?: ApiUser };
  
  // Local state for snackbar
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });
  
  // Data fetching
  const subsystemsData = useSubsystemsData(uid, '', 2, 0, 20);
  
  // Subsystem creation state
  const subsystemCreationState = useSubsystemCreationState();

  // Dialog state management
  const [createSubsystemOpen, setCreateSubsystemOpen] = useState(false);

  // Permission checking
  const canManage =
    !!me &&
    ((Number(me.is_admin) === 1) || (Number(me.is_system) === 1 && String(me.id) === String(uid)));

  const pageCount = Math.max(1, Math.ceil((subsystemsData.total || 0) / 20));
  const displayStart = subsystemsData.total === 0 ? 0 : 0 * 20 + 1;
  const displayEnd = subsystemsData.total === 0 ? 0 : Math.min(subsystemsData.total, (0 + 1) * 20);

  const handleDelete = async (subsystemId: number | string) => {
    try {
  await apiClient.subsystem.delete_subsystems_by_id(subsystemId);
      await subsystemsData.refresh();
      setSnack({ open: true, message: 'Subsystem deleted', severity: 'success' });
    } catch (error) {
      setSnack({ open: true, message: 'Failed to delete subsystem', severity: 'error' });
    }
  };

  const handleCreateSubsystem = async (payload: Record<string, unknown>) => {
  const response = await apiClient.subsystem.post_subsystems(payload as any);
  return response.data;
  };

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => setCreateSubsystemOpen(true)}>
            Create Subsystem
          </Button>
          <Dialog
            open={createSubsystemOpen}
            onClose={() => setCreateSubsystemOpen(false)}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>Create subsystem</DialogTitle>
            <DialogContent>
              <Box
                component="form"
                onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!subsystemCreationState.newSubsystemName || !subsystemCreationState.newSubsystemName.trim())
                    return setSnack({ open: true, message: 'Name required', severity: 'error' });
                  try {
                    const payload: Record<string, unknown> = {
                      name: subsystemCreationState.newSubsystemName.trim(),
                      description: subsystemCreationState.newSubsystemDesc || null,
                      type: subsystemCreationState.newSubsystemType || 'normal',
                    };
                    if (uid) payload.owner_user_id = Number(uid);
                    await handleCreateSubsystem(payload);
                    try {
                      await subsystemsData.refresh();
                    } catch (e) {
                      // ignore refresh errors
                    }
                    setSnack({ open: true, message: 'Subsystem created', severity: 'success' });
                    subsystemCreationState.setNewSubsystemName('');
                    subsystemCreationState.setNewSubsystemDesc('');
                    subsystemCreationState.setNewSubsystemType('normal');
                    // If parent handler returns a promise for closing, await it; otherwise call synchronously
                    try {
                      const maybe = setCreateSubsystemOpen(false) as unknown;
                      if (maybe && typeof (maybe as { then?: unknown }).then === 'function') {
                        await (maybe as Promise<void>);
                      }
                    } catch (e) {
                      // ignore
                    }
                  } catch (err) {
                    setSnack({ open: true, message: String(err || 'create failed'), severity: 'error' });
                  }
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={subsystemCreationState.newSubsystemName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => subsystemCreationState.setNewSubsystemName(e.target.value)}
                    sx={{ minWidth: 240 }}
                  />
                  <TextField
                    size="small"
                    label="Description"
                    value={subsystemCreationState.newSubsystemDesc}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => subsystemCreationState.setNewSubsystemDesc(e.target.value)}
                    sx={{ minWidth: 320 }}
                  />
                  <Autocomplete
                    size="small"
                    options={[
                      { id: 'normal', label: 'normal' },
                      { id: 'nested-did', label: 'nested-did' },
                    ]}
                    getOptionLabel={(o: { id: string; label: string } | null) => (o ? o.label : '')}
                    value={
                      subsystemCreationState.newSubsystemType ? { id: subsystemCreationState.newSubsystemType, label: subsystemCreationState.newSubsystemType } : null
                    }
                    onChange={(_e: React.SyntheticEvent, v: { id: string; label: string } | null) =>
                      subsystemCreationState.setNewSubsystemType(v ? v.id : 'normal')
                    }
                    renderInput={(params: Parameters<typeof TextField>[0]) => <TextField {...params} label="Type" />}
                    sx={{ minWidth: 180 }}
                  />
                  <Button variant="contained" type="submit">
                    Create
                  </Button>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateSubsystemOpen(false)}>Cancel</Button>
            </DialogActions>
          </Dialog>
        </div>
      )}

      <List>
        {subsystemsData.items.map((s: Subsystem, idx: number) => (
          <React.Fragment key={s.id}>
            <ListItem
              secondaryAction={
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => nav(`/detail/subsystem/${s.id}?uid=${encodeURIComponent(String(uid))}`)}
                  >
                    View
                  </Button>
                  {canManage && (
                    <Button variant="outlined" size="small" onClick={() => nav(`/subsystems/${s.id}/edit`)}>
                      Edit
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="outlined" color="error" size="small" onClick={() => handleDelete(Number(s.id))}>
                      Delete
                    </Button>
                  )}
                </div>
              }
            >
              <ListItemText primary={s.name} secondary={s.description} />
            </ListItem>
            {idx < subsystemsData.items.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {subsystemsData.loading && subsystemsData.total === 0
            ? 'Loading…'
            : subsystemsData.total === 0
              ? 'No subsystems to display'
              : `Showing ${displayStart}-${displayEnd} of ${subsystemsData.total}`}
        </Typography>
        <Pagination
          count={pageCount}
          page={Math.min(0 + 1, pageCount)}
          onChange={(_event, value) => {
            // For now, keep pagination simple - can be enhanced later
          }}
          color="primary"
          size="small"
          disabled={pageCount <= 1}
        />
      </div>

      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
