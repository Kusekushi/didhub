import React from 'react';
import { ListItem, ListItemText, ListItemAvatar, Divider } from '@mui/material';

import type { Group } from '@didhub/api-client';
import GroupAvatar from './GroupAvatar';
import GroupActions from './GroupActions';
import { SnackbarMessage } from '../NotificationSnackbar';
import type { SettingsState } from '../../contexts/SettingsContext';

export interface GroupListItemProps {
  group: Group;
  canManage: boolean;
  settings: SettingsState;
  setEditingGroup: (group: Group | null) => void;
  setEditGroupOpen: (open: boolean) => void;
  onDelete: (groupId: number | string) => Promise<void>;
  setSnack: (snack: SnackbarMessage) => void;
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
            onDelete={props.onDelete}
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
