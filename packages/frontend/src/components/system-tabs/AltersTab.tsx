import React from 'react';
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
import { apiClient, parseRoles, getShortLinkUrl } from '@didhub/api-client';
import type { Alter } from '@didhub/api-client';
import { SnackbarMessage } from '../NotificationSnackbar';
import type { SettingsState } from '../../contexts/SettingsContext';

interface AltersTabProps {
  routeUid?: string | number | null;
  canManage: boolean;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  items: Alter[];
  loading: boolean;
  search: string;
  hideDormant: boolean;
  hideMerged: boolean;
  editingAlter: number | string | null;
  setEditingAlter: (id: number | string | null) => void;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onDelete: (alterId: number | string) => Promise<void>;
  settings: SettingsState;
  setSnack: (snack: SnackbarMessage) => void;
  refreshAlters: () => Promise<void>;
}

export default function AltersTab(props: AltersTabProps) {
  const nav = useNavigate();
  const filteredItems = props.items
    .filter((alter: Alter) => !props.search || (alter.name || '').toLowerCase().includes(props.search.toLowerCase()))
    .filter((alter: Alter) => (props.hideDormant ? !alter?.is_dormant : true))
    .filter((alter: Alter) => (props.hideMerged ? !alter?.is_merged : true));
  const pageCount = Math.max(1, Math.ceil((props.total || 0) / Math.max(1, props.pageSize)));
  const displayStart = props.total === 0 ? 0 : props.page * props.pageSize + 1;
  const displayEnd = props.total === 0 ? 0 : Math.min(props.total, (props.page + 1) * props.pageSize);

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
            routeUid={props.routeUid}
            onClose={() => props.setCreateOpen(false)}
            onCreated={async () => {
              await props.refreshAlters();
              props.setCreateOpen(false);
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
                    props.canManage
                      ? () => {
                          props.setEditingAlter(it.id);
                          props.setEditOpen(true);
                        }
                      : undefined
                  }
                  onDelete={props.canManage ? () => props.onDelete(it.id) : undefined}
                  onShare={async () => {
                    if (!props.settings.shortLinksEnabled || it.id == null) return;
                    try {
                      const record = await apiClient.shortlinks
                        .create('alter', it.id as number | string)
                        .catch(() => null);
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
          {props.loading && props.total === 0
            ? 'Loading…'
            : props.total === 0
              ? 'No alters to display'
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

      <AlterFormDialog
        mode="edit"
        open={props.editOpen}
        routeUid={props.routeUid}
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
