import React from 'react';
import { ListItem, ListItemText, ListItemAvatar, Divider } from '@mui/material';

import { Group } from '@didhub/api-client';
import GroupAvatar from './GroupAvatar';
import GroupActions from './GroupActions';

export interface GroupListItemProps {
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
export default function GroupListItem(props: GroupListItemProps) {
  return (
    <React.Fragment>
      <ListItem
        secondaryAction={
          <GroupActions
            group={props.group}
            canManage={props.canManage}
            settings={props.settings}
            setEditingGroup={props.setEditingGroup}
            setEditGroupOpen={props.setEditGroupOpen}
            setDeleteDialog={props.setDeleteDialog}
            setSnack={props.setSnack}
          />
        }
      >
        <ListItemAvatar>
          <GroupAvatar group={props.group} />
        </ListItemAvatar>
        <ListItemText primary={props.group.name} secondary={props.group.description} />
      </ListItem>
      {!props.isLast && <Divider component="li" />}
    </React.Fragment>
  );
}