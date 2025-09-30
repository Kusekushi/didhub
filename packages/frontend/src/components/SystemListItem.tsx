import React from 'react';
import { ListItem, ListItemText, Button, ListItemAvatar } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import SystemAvatar from './SystemAvatar';
import type { SystemSummary } from '../hooks/useSystemList';

export interface SystemListItemProps {
  system: SystemSummary;
  primary?: (s: SystemSummary) => React.ReactNode;
  secondary?: (s: SystemSummary) => React.ReactNode;
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
        secondary={
          props.secondary
            ? props.secondary(props.system)
            : typeof props.system.description === 'string'
            ? props.system.description
            : null
        }
      />
    </ListItem>
  );
}
