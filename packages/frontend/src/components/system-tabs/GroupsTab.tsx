import React from 'react';
import { Button, List } from '@mui/material';

import CreateGroupDialog from './CreateGroupDialog';
import EditGroupDialog from './EditGroupDialog';
import GroupListItem from './GroupListItem';
import { Alter, Group } from '@didhub/api-client';

interface GroupsTabProps {
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
  setDeleteDialog: (dialog: {
    open: boolean;
    type: 'alter' | 'group' | 'subsystem';
    id: number | string;
    label: string;
  }) => void;
  settings: any;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function GroupsTab({
  canManage,
  createGroupOpen,
  setCreateGroupOpen,
  newGroupName,
  setNewGroupName,
  newGroupDesc,
  setNewGroupDesc,
  newGroupLeaders,
  setNewGroupLeaders,
  newGroupSigilFiles,
  setNewGroupSigilFiles,
  newGroupSigilUrl,
  setNewGroupSigilUrl,
  newGroupSigilUploading,
  setNewGroupSigilUploading,
  newGroupSigilDrag,
  setNewGroupSigilDrag,
  leaderQuery,
  setLeaderQuery,
  altersOptions,
  groups,
  editingGroup,
  setEditingGroup,
  editGroupOpen,
  setEditGroupOpen,
  editingGroupSigilUploading,
  setEditingGroupSigilUploading,
  editingGroupSigilDrag,
  setEditingGroupSigilDrag,
  setDeleteDialog,
  settings,
  setSnack,
  refreshGroups,
  uploadFiles,
}: GroupsTabProps) {
  return (
    <div>
      {canManage && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="contained" onClick={() => setCreateGroupOpen(true)}>
            Create Group
          </Button>
          <CreateGroupDialog
            open={createGroupOpen}
            onClose={() => setCreateGroupOpen(false)}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupDesc={newGroupDesc}
            setNewGroupDesc={setNewGroupDesc}
            newGroupLeaders={newGroupLeaders}
            setNewGroupLeaders={setNewGroupLeaders}
            newGroupSigilFiles={newGroupSigilFiles}
            setNewGroupSigilFiles={setNewGroupSigilFiles}
            newGroupSigilUrl={newGroupSigilUrl}
            setNewGroupSigilUrl={setNewGroupSigilUrl}
            newGroupSigilUploading={newGroupSigilUploading}
            setNewGroupSigilUploading={setNewGroupSigilUploading}
            newGroupSigilDrag={newGroupSigilDrag}
            setNewGroupSigilDrag={setNewGroupSigilDrag}
            leaderQuery={leaderQuery}
            setLeaderQuery={setLeaderQuery}
            altersOptions={altersOptions}
            setSnack={setSnack}
            refreshGroups={refreshGroups}
            uploadFiles={uploadFiles}
          />
        </div>
      )}

      <List>
        {groups.map((g: Group, idx: number) => (
          <GroupListItem
            key={g.id}
            group={g}
            canManage={canManage}
            settings={settings}
            setEditingGroup={setEditingGroup}
            setEditGroupOpen={setEditGroupOpen}
            setDeleteDialog={setDeleteDialog}
            setSnack={setSnack}
            isLast={idx === groups.length - 1}
          />
        ))}
      </List>

      <EditGroupDialog
        open={editGroupOpen}
        onClose={() => {
          setEditGroupOpen(false);
          setEditingGroup(null);
        }}
        editingGroup={editingGroup}
        setEditingGroup={setEditingGroup}
        editingGroupSigilUploading={editingGroupSigilUploading}
        setEditingGroupSigilUploading={setEditingGroupSigilUploading}
        editingGroupSigilDrag={editingGroupSigilDrag}
        setEditingGroupSigilDrag={setEditingGroupSigilDrag}
        setSnack={setSnack}
        refreshGroups={refreshGroups}
        uploadFiles={uploadFiles}
      />
    </div>
  );
}
