import React from 'react';
import { ListItem, ListItemText, ListItemAvatar, Divider } from '@mui/material';

import { Group } from '@didhub/api-client';
import GroupAvatar from './GroupAvatar';
import GroupActions from './GroupActions';

interface GroupListItemProps {
  group: Group;
  canManage: boolean;
  settings: any;
  setEditingGroup: (group: Group | null) => void;
  setEditGroupOpen: (open: boolean) => void;
  setDeleteDialog: (dialog: {
    open: boolean;
    type: 'alter' | 'group' | 'subsystem';
    id: number | string;
    label: string;
  }) => void;
  setSnack: (snack: { open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }) => void;
  isLast: boolean;
}

/**
 * Component for individual group list items
 */
export default function GroupListItem({
  group,
  canManage,
  settings,
  setEditingGroup,
  setEditGroupOpen,
  setDeleteDialog,
  setSnack,
  isLast,
}: GroupListItemProps) {
  return (
    <React.Fragment>
      <ListItem
        secondaryAction={
          <GroupActions
            group={group}
            canManage={canManage}
            settings={settings}
            setEditingGroup={setEditingGroup}
            setEditGroupOpen={setEditGroupOpen}
            setDeleteDialog={setDeleteDialog}
            setSnack={setSnack}
          />
        }
      >
        <ListItemAvatar>
          <GroupAvatar group={group} />
        </ListItemAvatar>
        <ListItemText primary={group.name} secondary={group.description} />
      </ListItem>
      {!isLast && <Divider component="li" />}
    </React.Fragment>
  );
}