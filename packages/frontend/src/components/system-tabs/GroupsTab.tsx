import React from 'react';
import { Button, List, Pagination, Typography } from '@mui/material';

import GroupDialog from './GroupDialog';
import GroupListItem from './GroupListItem';
import type { Alter, Group } from '@didhub/api-client';
import { SnackbarMessage } from '../NotificationSnackbar';
import type { SettingsState } from '../../contexts/SettingsContext';

export interface GroupsTabProps {
  canManage: boolean;
  createGroupOpen: boolean;
  setCreateGroupOpen: (open: boolean) => void;
  newGroupName: string;
  setNewGroupName: (name: string) => void;
  newGroupDesc: string;
  setNewGroupDesc: (desc: string) => void;
  newGroupLeaders: Alter[];
  setNewGroupLeaders: (leaders: Alter[]) => void;
  newGroupSigilFiles: File[];
  setNewGroupSigilFiles: (files: File[]) => void;
  newGroupSigilUrl: string | null;
  setNewGroupSigilUrl: (url: string | null) => void;
  newGroupSigilUploading: boolean;
  setNewGroupSigilUploading: (uploading: boolean) => void;
  newGroupSigilDrag: boolean;
  setNewGroupSigilDrag: (drag: boolean) => void;
  leaderQuery: string;
  setLeaderQuery: (query: string) => void;
  altersOptions: Alter[];
  groups: Group[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  editingGroup: Group | null;
  setEditingGroup: (group: Group | null) => void;
  editGroupOpen: boolean;
  setEditGroupOpen: (open: boolean) => void;
  editingGroupSigilUploading: boolean;
  setEditingGroupSigilUploading: (uploading: boolean) => void;
  editingGroupSigilDrag: boolean;
  setEditingGroupSigilDrag: (drag: boolean) => void;
  onDelete: (groupId: number | string) => Promise<void>;
  settings: SettingsState;
  setSnack: (snack: SnackbarMessage) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function GroupsTab(props: GroupsTabProps) {
  const pageCount = Math.max(1, Math.ceil((props.total || 0) / Math.max(1, props.pageSize)));
  const displayStart = props.total === 0 ? 0 : props.page * props.pageSize + 1;
  const displayEnd = props.total === 0 ? 0 : Math.min(props.total, (props.page + 1) * props.pageSize);

  return (
    <div>
      {props.canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => props.setCreateGroupOpen(true)}>
            Create Group
          </Button>
          <GroupDialog
            mode="create"
            open={props.createGroupOpen}
            onClose={() => props.setCreateGroupOpen(false)}
            newGroupName={props.newGroupName}
            setNewGroupName={props.setNewGroupName}
            newGroupDesc={props.newGroupDesc}
            setNewGroupDesc={props.setNewGroupDesc}
            newGroupLeaders={props.newGroupLeaders}
            setNewGroupLeaders={props.setNewGroupLeaders}
            newGroupSigilFiles={props.newGroupSigilFiles}
            setNewGroupSigilFiles={props.setNewGroupSigilFiles}
            newGroupSigilUrl={props.newGroupSigilUrl}
            setNewGroupSigilUrl={props.setNewGroupSigilUrl}
            newGroupSigilUploading={props.newGroupSigilUploading}
            setNewGroupSigilUploading={props.setNewGroupSigilUploading}
            newGroupSigilDrag={props.newGroupSigilDrag}
            setNewGroupSigilDrag={props.setNewGroupSigilDrag}
            leaderQuery={props.leaderQuery}
            setLeaderQuery={props.setLeaderQuery}
            altersOptions={props.altersOptions}
            setSnack={props.setSnack}
            refreshGroups={props.refreshGroups}
            uploadFiles={props.uploadFiles}
          />
        </div>
      )}

      <List>
        {props.groups.map((g: Group, idx: number) => (
          <GroupListItem
            key={g.id}
            group={g}
            canManage={props.canManage}
            settings={props.settings}
            setEditingGroup={props.setEditingGroup}
            setEditGroupOpen={props.setEditGroupOpen}
            onDelete={props.onDelete}
            setSnack={props.setSnack}
            isLast={idx === props.groups.length - 1}
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
          {props.loading && props.total === 0
            ? 'Loading…'
            : props.total === 0
              ? 'No groups to display'
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

      <GroupDialog
        mode="edit"
        open={props.editGroupOpen}
        onClose={() => {
          props.setEditGroupOpen(false);
          props.setEditingGroup(null);
        }}
        editingGroup={props.editingGroup}
        setEditingGroup={props.setEditingGroup}
        editingGroupSigilUploading={props.editingGroupSigilUploading}
        setEditingGroupSigilUploading={props.setEditingGroupSigilUploading}
        editingGroupSigilDrag={props.editingGroupSigilDrag}
        setEditingGroupSigilDrag={props.setEditingGroupSigilDrag}
        leaderQuery={props.leaderQuery}
        setLeaderQuery={props.setLeaderQuery}
        altersOptions={props.altersOptions}
        setSnack={props.setSnack}
        refreshGroups={props.refreshGroups}
        uploadFiles={props.uploadFiles}
      />
    </div>
  );
}
