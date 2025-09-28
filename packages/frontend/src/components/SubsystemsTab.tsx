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
} from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import { Subsystem } from '@didhub/api-client';

interface SubsystemsTabProps {
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
  uid: string;
  setDeleteDialog: (dialog: {
    open: boolean;
    type: 'alter' | 'group' | 'subsystem';
    id: number | string;
    label: string;
  }) => void;
  settings: any;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  refreshSubsystems: () => Promise<void>;
  createSubsystem: (payload: any) => Promise<any>;
  createShortLink: (type: string, id: number) => Promise<any>;
  nav: (path: string) => void;
}

export default function SubsystemsTab({
  canManage,
  createSubsystemOpen,
  setCreateSubsystemOpen,
  newSubsystemName,
  setNewSubsystemName,
  newSubsystemDesc,
  setNewSubsystemDesc,
  newSubsystemType,
  setNewSubsystemType,
  subsystems,
  uid,
  setDeleteDialog,
  settings,
  setSnack,
  refreshSubsystems,
  createSubsystem,
  createShortLink,
  nav,
}: SubsystemsTabProps) {
  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => setCreateSubsystemOpen(true)}>
            Create Subsystem
          </Button>
          <Dialog open={createSubsystemOpen} onClose={() => setCreateSubsystemOpen(false)} fullWidth maxWidth="sm">
            <DialogTitle>Create subsystem</DialogTitle>
            <DialogContent>
              <Box
                component="form"
                onSubmit={async (e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  if (!newSubsystemName || !newSubsystemName.trim())
                    return setSnack({ open: true, message: 'Name required', severity: 'error' });
                  try {
                    const payload = {
                      name: newSubsystemName.trim(),
                      description: newSubsystemDesc || null,
                      type: newSubsystemType || 'normal',
                      owner_user_id: uid,
                    };
                    const r = await createSubsystem(payload);
                    if (!r || (r as any).status >= 400) throw new Error('Create failed');
                    await refreshSubsystems();
                    setSnack({ open: true, message: 'Subsystem created', severity: 'success' });
                    setNewSubsystemName('');
                    setNewSubsystemDesc('');
                    setNewSubsystemType('normal');
                    setCreateSubsystemOpen(false);
                  } catch (err) {
                    setSnack({ open: true, message: String(err || 'create failed'), severity: 'error' });
                  }
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 1 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={newSubsystemName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSubsystemName(e.target.value)}
                    sx={{ minWidth: 240 }}
                  />
                  <TextField
                    size="small"
                    label="Description"
                    value={newSubsystemDesc}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSubsystemDesc(e.target.value)}
                    sx={{ minWidth: 320 }}
                  />
                  <Autocomplete
                    size="small"
                    options={[
                      { id: 'normal', label: 'normal' },
                      { id: 'nested-did', label: 'nested-did' },
                    ]}
                    getOptionLabel={(o: { id: string; label: string } | null) => (o ? o.label : '')}
                    value={newSubsystemType ? { id: newSubsystemType, label: newSubsystemType } : null}
                    onChange={(_e: React.SyntheticEvent, v: { id: string; label: string } | null) =>
                      setNewSubsystemType(v ? v.id : 'normal')
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
        {subsystems.map((s: Subsystem, idx: number) => (
          <React.Fragment key={s.id}>
            <ListItem
              secondaryAction={
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outlined" size="small" onClick={() => nav(`/did-system/${uid}/subsystems/${s.id}`)}>
                    View
                  </Button>
                  {canManage && (
                    <Button variant="outlined" size="small" onClick={() => nav(`/subsystems/${s.id}/edit`)}>
                      Edit
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() =>
                        setDeleteDialog({
                          open: true,
                          type: 'subsystem',
                          id: Number(s.id),
                          label: s.name || 'subsystem',
                        })
                      }
                    >
                      Delete
                    </Button>
                  )}
                  <Tooltip title="Create share link and copy to clipboard">
                    {settings.shortLinksEnabled && (
                      <IconButton
                        size="small"
                        onClick={async () => {
                          try {
                            const r = await createShortLink('subsystem', Number(s.id)).catch(() => null);
                            if (!r || (!r.token && !r.url))
                              throw new Error(r && r.error ? String(r.error) : 'failed to create share link');
                            const path = r.url || `/s/${r.token}`;
                            const url = path.startsWith('http')
                              ? path
                              : window.location.origin.replace(/:\d+$/, '') + path;
                            await navigator.clipboard.writeText(url);
                            setSnack({ open: true, message: 'Share link copied', severity: 'success' });
                          } catch (e) {
                            setSnack({
                              open: true,
                              message: String(e?.message || e || 'Failed to create share link'),
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
            {idx < subsystems.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>
    </div>
  );
}
