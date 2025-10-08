import React, { useState } from 'react';
import {
  Avatar,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Pagination,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PersonIcon from '@mui/icons-material/Person';

import AlterFormDialog from '../AlterFormDialog';
import ThumbnailWithHover from '../ThumbnailWithHover';
import ActionButtons from '../ActionButtons';
import { parseRoles } from '@didhub/api-client';
import type { Alter } from '@didhub/api-client';
import { SnackbarMessage } from '../NotificationSnackbar';
import NotificationSnackbar from '../NotificationSnackbar';
import { useAltersData } from '../../hooks/useAltersData';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '@didhub/api-client';
import type { User } from '@didhub/api-client';

interface AltersTabProps {
  routeUid?: string | number | null;
}

export default function AltersTab({ routeUid }: AltersTabProps) {
  const nav = useNavigate();
  const { user: me } = useAuth() as { user?: User };
  
  // Local state for snackbar
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });
  
  // Data fetching - let the hook handle filtering
  const altersData = useAltersData(routeUid as string | undefined, '', 0, 0, 20);
  
  // Dialog state management
  const [editingAlter, setEditingAlter] = useState<number | string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  
  // Permission checking
  const canManage = me && (me.is_admin || (me.is_system && String(me.id) === String(routeUid)));
  
  const filteredItems = altersData.items;
  const pageCount = Math.max(1, Math.ceil((altersData.total || 0) / 20));
  const displayStart = altersData.total === 0 ? 0 : 0 * 20 + 1;
  const displayEnd = altersData.total === 0 ? 0 : Math.min(altersData.total, (0 + 1) * 20);

  const handleDelete = async (alterId: number | string) => {
    try {
      await apiClient.alters.remove(alterId);
      await altersData.refresh();
      setSnack({ open: true, message: 'Alter deleted', severity: 'success' });
    } catch (error) {
      setSnack({ open: true, message: 'Failed to delete alter', severity: 'error' });
    }
  };

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Create Alter
          </Button>
          <AlterFormDialog
            mode="create"
            open={createOpen}
            routeUid={routeUid}
            onClose={() => setCreateOpen(false)}
            onCreated={async () => {
              await altersData.refresh();
              setCreateOpen(false);
            }}
          />
        </div>
      )}
      <List>
        {filteredItems.map((it: Alter, idx: number) => (
          <React.Fragment key={it.id}>
            <ListItem
              alignItems="flex-start"
              disablePadding
              secondaryAction={
                <ActionButtons
                  onView={() => nav(`/detail/${it.id}`)}
                  onEdit={
                    canManage
                      ? () => {
                          setEditingAlter(it.id);
                          setEditOpen(true);
                        }
                      : undefined
                  }
                  onDelete={canManage ? () => handleDelete(it.id) : undefined}
                  canManage={canManage}
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
                      opacity: it.is_dormant ? 0.6 : 1,
                      textDecoration: it.is_merged ? 'line-through' : 'none',
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
                        {it.is_dormant ? (
                          <Chip label="Dormant" size="small" variant="outlined" color="default" />
                        ) : null}
                        {it.is_merged ? <Chip label="Merged" size="small" color="warning" /> : null}
                      </Stack>
                    </div>
                  </div>
                }
                secondaryTypographyProps={{ component: 'div' }}
              />
            </ListItem>
            {idx < filteredItems.length - 1 && <Divider component="li" />}
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
          {altersData.loading && altersData.total === 0
            ? 'Loading…'
            : altersData.total === 0
              ? 'No alters to display'
              : `Showing ${displayStart}-${displayEnd} of ${altersData.total}`}
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

      <AlterFormDialog
        mode="edit"
        open={editOpen}
        routeUid={routeUid}
        id={editingAlter}
        onClose={() => {
          setEditOpen(false);
          setEditingAlter(null);
        }}
        onSaved={async () => {
          await altersData.refresh();
          setEditOpen(false);
          setEditingAlter(null);
          setSnack({ open: true, message: 'Alter updated', severity: 'success' });
        }}
      />

      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
