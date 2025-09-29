import React from 'react';
import { ListItem, ListItemText, Button, ListItemAvatar } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import SystemAvatar from './SystemAvatar';

type System = any;

export interface SystemListItemProps {
  system: System;
  primary?: (s: System) => React.ReactNode;
  secondary?: (s: System) => React.ReactNode;
}

/**
 * Component for individual system list items
 */
export default function SystemListItem(props: SystemListItemProps) {
  return (
    <ListItem
      secondaryAction={
        <Button component={RouterLink} to={`/did-system/${props.system.user_id}`}>
          View
        </Button>
      }
    >
      <ListItemAvatar>
        <SystemAvatar system={props.system} />
      </ListItemAvatar>
      <ListItemText
        primary={props.primary ? props.primary(props.system) : props.system.username}
        secondary={props.secondary ? props.secondary(props.system) : props.system.description || null}
      />
    </ListItem>
  );
}
