import React from 'react';
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
  IconButton,
  Tooltip,
  Pagination,
  Typography,
} from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { getShortLinkUrl } from '@didhub/api-client';
import type { Subsystem, ShortLinkRecord } from '@didhub/api-client';
import { SnackbarMessage } from './NotificationSnackbar';
import type { SettingsState } from '../contexts/SettingsContext';

export interface SubsystemsTabProps {
  canManage: boolean;
  createSubsystemOpen: boolean;
  setCreateSubsystemOpen: (open: boolean) => void;
  newSubsystemName: string;
  setNewSubsystemName: (name: string) => void;
  newSubsystemDesc: string;
  setNewSubsystemDesc: (desc: string) => void;
  newSubsystemType: string;
  setNewSubsystemType: (type: string) => void;
  subsystems: Subsystem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  uid: string;
  onDelete: (subsystemId: number | string) => Promise<void>;
  settings: SettingsState;
  setSnack: (snack: SnackbarMessage) => void;
  refreshSubsystems: () => Promise<void>;
  createSubsystem: (payload: Record<string, unknown>) => Promise<Subsystem>;
  createShortLink: (type: string, id: number, options?: { target?: string }) => Promise<ShortLinkRecord>;
  nav: (path: string) => void;
}

export default function SubsystemsTab(props: SubsystemsTabProps) {
  const pageCount = Math.max(1, Math.ceil((props.total || 0) / Math.max(1, props.pageSize)));
  const displayStart = props.total === 0 ? 0 : props.page * props.pageSize + 1;
  const displayEnd = props.total === 0 ? 0 : Math.min(props.total, (props.page + 1) * props.pageSize);

  return (
    <div>
      {props.canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => props.setCreateSubsystemOpen(true)}>
            Create Subsystem
          </Button>
          <Dialog
            open={props.createSubsystemOpen}
            onClose={() => props.setCreateSubsystemOpen(false)}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>Create subsystem</DialogTitle>
            <DialogContent>
              <Box
                component="form"
                onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!props.newSubsystemName || !props.newSubsystemName.trim())
                    return props.setSnack({ open: true, message: 'Name required', severity: 'error' });
                  try {
                    const payload = {
                      name: props.newSubsystemName.trim(),
                      description: props.newSubsystemDesc || null,
                      type: props.newSubsystemType || 'normal',
                      owner_user_id: props.uid,
                    };
                    await props.createSubsystem(payload);
                    await props.refreshSubsystems();
                    props.setSnack({ open: true, message: 'Subsystem created', severity: 'success' });
                    props.setNewSubsystemName('');
                    props.setNewSubsystemDesc('');
                    props.setNewSubsystemType('normal');
                    props.setCreateSubsystemOpen(false);
                  } catch (err) {
                    props.setSnack({ open: true, message: String(err || 'create failed'), severity: 'error' });
                  }
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={props.newSubsystemName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setNewSubsystemName(e.target.value)}
                    sx={{ minWidth: 240 }}
                  />
                  <TextField
                    size="small"
                    label="Description"
                    value={props.newSubsystemDesc}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.setNewSubsystemDesc(e.target.value)}
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
                      props.newSubsystemType ? { id: props.newSubsystemType, label: props.newSubsystemType } : null
                    }
                    onChange={(_e: React.SyntheticEvent, v: { id: string; label: string } | null) =>
                      props.setNewSubsystemType(v ? v.id : 'normal')
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
              <Button onClick={() => props.setCreateSubsystemOpen(false)}>Cancel</Button>
            </DialogActions>
          </Dialog>
        </div>
      )}

      <List>
        {props.subsystems.map((s: Subsystem, idx: number) => (
          <React.Fragment key={s.id}>
            <ListItem
              secondaryAction={
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => props.nav(`/did-system/${props.uid}/subsystems/${s.id}`)}
                  >
                    View
                  </Button>
                  {props.canManage && (
                    <Button variant="outlined" size="small" onClick={() => props.nav(`/subsystems/${s.id}/edit`)}>
                      Edit
                    </Button>
                  )}
                  {props.canManage && (
                    <Button variant="outlined" color="error" size="small" onClick={() => props.onDelete(Number(s.id))}>
                      Delete
                    </Button>
                  )}
                  <Tooltip title="Create share link and copy to clipboard">
                    {props.settings.shortLinksEnabled && (
                      <IconButton
                        size="small"
                        onClick={async () => {
                          try {
                            const record = await props.createShortLink('subsystem', Number(s.id)).catch(() => null);
                            if (!record) {
                              throw new Error('Failed to create share link');
                            }
                            const shareUrl = getShortLinkUrl(record);
                            await navigator.clipboard.writeText(shareUrl);
                            props.setSnack({ open: true, message: 'Share link copied', severity: 'success' });
                          } catch (error: unknown) {
                            const message =
                              error instanceof Error ? error.message : String(error ?? 'Failed to create share link');
                            props.setSnack({
                              open: true,
                              message,
                              severity: 'error',
                            });
                          }
                        }}
                      >
                        <ShareIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Tooltip>
                </div>
              }
            >
              <ListItemText primary={s.name} secondary={s.description} />
            </ListItem>
            {idx < props.subsystems.length - 1 && <Divider component="li" />}
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
          {props.loading && props.total === 0
            ? 'Loading…'
            : props.total === 0
              ? 'No subsystems to display'
              : `Showing ${displayStart}-${displayEnd} of ${props.total}`}
        </Typography>
        <Pagination
          count={pageCount}
          page={Math.min(props.page + 1, pageCount)}
          onChange={(_event, value) => props.onPageChange(value - 1)}
          color="primary"
          size="small"
          disabled={pageCount <= 1}
        />
      </div>
    </div>
  );
}
