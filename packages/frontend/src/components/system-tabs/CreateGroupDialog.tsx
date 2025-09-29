import React from 'react';
import { Alter } from '@didhub/api-client';
import GroupDialog from './GroupDialog';
import { SnackbarMessage } from '../NotificationSnackbar';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
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
  setSnack: (snack: SnackbarMessage) => void;
  refreshGroups: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<string[]>;
}

export default function CreateGroupDialog(props: CreateGroupDialogProps) {
  return (
    <GroupDialog
      mode="create"
      open={props.open}
      onClose={props.onClose}
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
  );
}
