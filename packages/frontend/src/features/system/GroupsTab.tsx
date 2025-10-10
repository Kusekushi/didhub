import React, { useState } from 'react';
import { Button, List, Pagination, Typography } from '@mui/material';
import { apiClient, type ApiUser, type Group } from '@didhub/api-client';

import GroupDialog from './GroupDialog';
import GroupListItem from './GroupListItem';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';
import { useAuth } from '../../shared/contexts/AuthContext';
import { useGroupsData } from '../../shared/hooks/useGroupsData';
import { uploadFiles } from '../../shared/utils/fileUpload';

export interface GroupsTabProps {
  uid: string;
}

export default function GroupsTab({ uid }: GroupsTabProps) {
  const { user: me } = useAuth() as { user?: ApiUser };
  
  // Local state for snackbar
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });
  
  // Data fetching
  const groupsData = useGroupsData(uid, '', 1, 0, 20);

  // Dialog state management
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  // Permission checking
  const canManage =
    !!me &&
    ((Number(me.is_admin) === 1) || (Number(me.is_system) === 1 && String(me.id) === String(uid)));

  const pageCount = Math.max(1, Math.ceil((groupsData.total || 0) / 20));
  const displayStart = groupsData.total === 0 ? 0 : 0 * 20 + 1;
  const displayEnd = groupsData.total === 0 ? 0 : Math.min(groupsData.total, (0 + 1) * 20);

  const handleDelete = async (groupId: number | string) => {
    try {
      await apiClient.group.delete_groups_by_id(groupId);
      await groupsData.refresh();
      setSnack({ open: true, message: 'Group deleted', severity: 'success' });
    } catch (error) {
      setSnack({ open: true, message: 'Failed to delete group', severity: 'error' });
    }
  };

  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => setCreateGroupOpen(true)}>
            Create Group
          </Button>
          <GroupDialog
            mode="create"
            open={createGroupOpen}
            onClose={() => setCreateGroupOpen(false)}
            uid={uid}
            uploadFiles={uploadFiles}
            onCreated={groupsData.refresh}
          />
        </div>
      )}

      <List>
        {groupsData.items.map((g: Group, idx: number) => (
          <GroupListItem
            key={g.id}
            group={g}
            canManage={canManage}
            setEditingGroup={setEditingGroup}
            setEditGroupOpen={setEditGroupOpen}
            onDelete={handleDelete}
            isLast={idx === groupsData.items.length - 1}
          />
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
          {groupsData.loading && groupsData.total === 0
            ? 'Loading…'
            : groupsData.total === 0
              ? 'No groups to display'
              : `Showing ${displayStart}-${displayEnd} of ${groupsData.total}`}
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

      <GroupDialog
        mode="edit"
        open={editGroupOpen}
        onClose={() => {
          setEditGroupOpen(false);
          setEditingGroup(null);
        }}
        uid={uid}
        uploadFiles={uploadFiles}
        onUpdated={groupsData.refresh}
        group={editingGroup || undefined}
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
