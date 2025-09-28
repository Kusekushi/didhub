import React from 'react';
import { ListItem, ListItemText, Button, ListItemAvatar } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import SystemAvatar from './SystemAvatar';

type System = any;

interface SystemListItemProps {
  system: System;
  primary?: (s: System) => React.ReactNode;
  secondary?: (s: System) => React.ReactNode;
}

/**
 * Component for individual system list items
 */
export default function SystemListItem({
  system,
  primary,
  secondary,
}: SystemListItemProps) {
  return (
    <ListItem
      secondaryAction={
        <Button component={RouterLink} to={`/did-system/${system.user_id}`}>
          View
        </Button>
      }
    >
      <ListItemAvatar>
        <SystemAvatar system={system} />
      </ListItemAvatar>
      <ListItemText
        primary={primary ? primary(system) : system.username}
        secondary={secondary ? secondary(system) : system.description || null}
      />
    </ListItem>
  );
}