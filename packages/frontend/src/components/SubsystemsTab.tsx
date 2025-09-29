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

export default function SubsystemsTab(props: SubsystemsTabProps) {
  return (
    <div>
      {props.canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => props.setCreateSubsystemOpen(true)}>
            Create Subsystem
          </Button>
          <Dialog open={props.createSubsystemOpen} onClose={() => props.setCreateSubsystemOpen(false)} fullWidth maxWidth="sm">
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
                    const r = await props.createSubsystem(payload);
                    if (!r || (r as any).status >= 400) throw new Error('Create failed');
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
                    value={props.newSubsystemType ? { id: props.newSubsystemType, label: props.newSubsystemType } : null}
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
                  <Button variant="outlined" size="small" onClick={() => props.nav(`/did-system/${props.uid}/subsystems/${s.id}`)}>
                    View
                  </Button>
                  {props.canManage && (
                    <Button variant="outlined" size="small" onClick={() => props.nav(`/subsystems/${s.id}/edit`)}>
                      Edit
                    </Button>
                  )}
                  {props.canManage && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() =>
                        props.setDeleteDialog({
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
                    {props.settings.shortLinksEnabled && (
                      <IconButton
                        size="small"
                        onClick={async () => {
                          try {
                            const r = await props.createShortLink('subsystem', Number(s.id)).catch(() => null);
                            if (!r || (!r.token && !r.url))
                              throw new Error(r && r.error ? String(r.error) : 'failed to create share link');
                            const path = r.url || `/s/${r.token}`;
                            const url = path.startsWith('http')
                              ? path
                              : window.location.origin.replace(/:\d+$/, '') + path;
                            await navigator.clipboard.writeText(url);
                            props.setSnack({ open: true, message: 'Share link copied', severity: 'success' });
                          } catch (e) {
                            props.setSnack({
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
            {idx < props.subsystems.length - 1 && <Divider component="li" />}
          </React.Fragment>
        ))}
      </List>
    </div>
  );
}
