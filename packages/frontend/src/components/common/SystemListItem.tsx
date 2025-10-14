import React from 'react';
import { ListItem, ListItemText, Button, ListItemAvatar } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import SystemAvatar from './SystemAvatar';
import { ApiUser } from '@didhub/api-client';

export interface SystemListItemProps {
  system: ApiUser;
  primary?: (s: ApiUser) => React.ReactNode;
  secondary?: (s: ApiUser) => React.ReactNode;
}

/**
 * Component for individual system list items
 */
export default function SystemListItem(props: SystemListItemProps) {
  return (
    <ListItem
      secondaryAction={
        <Button component={RouterLink} to={`/did-system/${props.system.id}`}>
          View
        </Button>
      }
    >
      <ListItemAvatar>
        <SystemAvatar system={props.system} />
      </ListItemAvatar>
      <ListItemText
        primary={props.primary ? props.primary(props.system) : props.system.username}
        // secondary={
        //   props.secondary
        //     ? props.secondary(props.system)
        //     : typeof props.system.description === 'string'
        //       ? props.system.description
        //       : null
        // }
      />
    </ListItem>
  );
}
