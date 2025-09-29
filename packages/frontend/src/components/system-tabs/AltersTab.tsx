import React from 'react';
import { Button, List, ListItem, ListItemText, ListItemAvatar, Avatar, Divider, Chip, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PersonIcon from '@mui/icons-material/Person';

import AlterFormDialog from '../AlterFormDialog';
import ThumbnailWithHover from '../ThumbnailWithHover';
import ActionButtons from '../ActionButtons';
import { Alter, parseRoles, createShortLink } from '@didhub/api-client';
import { SnackbarMessage } from '../NotificationSnackbar';

interface AltersTabProps {
  canManage: boolean;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  items: Alter[];
  search: string;
  hideDormant: boolean;
  hideMerged: boolean;
  editingAlter: number | string | null;
  setEditingAlter: (id: number | string | null) => void;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  onDelete: (alterId: number | string) => Promise<void>;
  settings: any;
  setSnack: (snack: SnackbarMessage) => void;
  refreshAlters: () => Promise<void>;
}

export default function AltersTab(props: AltersTabProps) {
  const nav = useNavigate();

  return (
    <div>
      {props.canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => props.setCreateOpen(true)}>
            Create Alter
          </Button>
          <AlterFormDialog
            mode="create"
            open={props.createOpen}
            onClose={() => props.setCreateOpen(false)}
            onCreated={async () => {
              await props.refreshAlters();
              props.setCreateOpen(false);
            }}
          />
        </div>
      )}
      <List>
        {props.items
          .filter((it: Alter) => !props.search || (it.name || '').toLowerCase().includes(props.search.toLowerCase()))
          .filter((it: Alter) => (props.hideDormant ? !(it as any).is_dormant : true))
          .filter((it: Alter) => (props.hideMerged ? !(it as any).is_merged : true))
          .map((it: Alter, idx: number) => (
            <React.Fragment key={it.id}>
              <ListItem
                alignItems="flex-start"
                disablePadding
                secondaryAction={
                  <ActionButtons
                    onView={() => nav(`/detail/${it.id}`)}
                    onEdit={
                      props.canManage
                        ? () => {
                            props.setEditingAlter(it.id);
                            props.setEditOpen(true);
                          }
                        : undefined
                    }
                    onDelete={props.canManage ? () => props.onDelete(it.id) : undefined}
                    onShare={async () => {
                      if (!props.settings.shortLinksEnabled) return;
                      try {
                        const resp = await createShortLink('alter', it.id).catch(() => null);
                        if (!resp || (!resp.token && !resp.url))
                          throw new Error(resp && resp.error ? String(resp.error) : 'failed');
                        const path = resp.url || `/s/${resp.token}`;
                        const url = path.startsWith('http') ? path : window.location.origin.replace(/:\d+$/, '') + path;
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
                    canManage={props.canManage}
                    canShare={props.settings.shortLinksEnabled}
                  />
                }
              >
                {Array.isArray(it.images) && it.images.length ? (
                  <ListItemAvatar>
                    <div style={{ marginRight: 4 }}>
                      <ThumbnailWithHover
                        image={it.images[0] as string}
                        alt={it.name || ''}
                        onClick={() => nav(`/detail/${it.id}`)}
                      />
                    </div>
                  </ListItemAvatar>
                ) : (
                  <ListItemAvatar>
                    <Avatar
                      variant="rounded"
                      sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#e0e0e0', color: '#555' }}
                    >
                      <PersonIcon fontSize="small" />
                    </Avatar>
                  </ListItemAvatar>
                )}
                <ListItemText
                  primary={
                    <span
                      style={{
                        opacity: (it as any).is_dormant ? 0.6 : 1,
                        textDecoration: (it as any).is_merged ? 'line-through' : 'none',
                      }}
                    >
                      {it.name || 'Unnamed'}
                    </span>
                  }
                  secondary={
                    <div>
                      <span style={{ fontSize: 12, color: '#666' }}>
                        Age: {it.age != null && it.age !== '' ? String(it.age) : '—'} {'  '} Pronouns:{' '}
                        {it.pronouns || '—'}
                      </span>
                      <div style={{ marginTop: 6 }}>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          {parseRoles(it.system_roles).map((r: string, i: number) => (
                            <Chip key={i} label={r} size="small" />
                          ))}
                          {it.is_system_host ? <Chip label="Host" color="primary" size="small" /> : null}
                          {(it as any).is_dormant ? (
                            <Chip label="Dormant" size="small" variant="outlined" color="default" />
                          ) : null}
                          {(it as any).is_merged ? <Chip label="Merged" size="small" color="warning" /> : null}
                        </Stack>
                      </div>
                    </div>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
              {idx < props.items.length - 1 && <Divider component="li" />}
            </React.Fragment>
          ))}
      </List>

      <AlterFormDialog
        mode="edit"
        open={props.editOpen}
        id={props.editingAlter}
        onClose={() => {
          props.setEditOpen(false);
          props.setEditingAlter(null);
        }}
        onSaved={async () => {
          await props.refreshAlters();
          props.setEditOpen(false);
          props.setEditingAlter(null);
          props.setSnack({ open: true, message: 'Alter updated', severity: 'success' });
        }}
      />
    </div>
  );
}
