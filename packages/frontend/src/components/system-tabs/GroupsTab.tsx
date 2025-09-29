import React from 'react';
import { Button, List } from '@mui/material';

import GroupDialog from './GroupDialog';
import GroupListItem from './GroupListItem';
import { Alter, Group } from '@didhub/api-client';
import { SnackbarMessage } from '../NotificationSnackbar';

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
  editingGroup: Group | null;
  setEditingGroup: (group: Group | null) => void;
  editGroupOpen: boolean;
  setEditGroupOpen: (open: boolean) => void;
  editingGroupSigilUploading: boolean;
  setEditingGroupSigilUploading: (uploading: boolean) => void;
  editingGroupSigilDrag: boolean;
  setEditingGroupSigilDrag: (drag: boolean) => void;
  onDelete: (groupId: number | string) => Promise<void>;
  settings: any;
  setSnack: (snack: SnackbarMessage) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function GroupsTab(props: GroupsTabProps) {
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
