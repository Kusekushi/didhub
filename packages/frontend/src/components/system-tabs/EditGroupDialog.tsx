import React from 'react';
import { Group } from '@didhub/api-client';
import GroupDialog from './GroupDialog';

export interface EditGroupDialogProps {
  open: boolean;
  onClose: () => void;
  editingGroup: Group | null;
  setEditingGroup: (group: Group | null) => void;
  editingGroupSigilUploading: boolean;
  setEditingGroupSigilUploading: (uploading: boolean) => void;
  editingGroupSigilDrag: boolean;
  setEditingGroupSigilDrag: (drag: boolean) => void;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function EditGroupDialog(props: EditGroupDialogProps) {
  return (
    <GroupDialog
      mode="edit"
      open={props.open}
      onClose={props.onClose}
      editingGroup={props.editingGroup}
      setEditingGroup={props.setEditingGroup}
      editingGroupSigilUploading={props.editingGroupSigilUploading}
      setEditingGroupSigilUploading={props.setEditingGroupSigilUploading}
      editingGroupSigilDrag={props.editingGroupSigilDrag}
      setEditingGroupSigilDrag={props.setEditingGroupSigilDrag}
      setSnack={props.setSnack}
      refreshGroups={props.refreshGroups}
      uploadFiles={props.uploadFiles}
    />
  );
}
