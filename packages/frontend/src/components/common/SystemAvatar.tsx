import React from 'react';
import { Avatar } from '@mui/material';
import { ApiSystemSummary } from '@didhub/api-client';

export interface SystemAvatarProps {
  system: ApiSystemSummary;
}

/**
 * Component for displaying system avatar
 */
export default function SystemAvatar(props: SystemAvatarProps) {
  if (typeof props.system.avatar === 'string' && props.system.avatar) {
    return <Avatar src={`/uploads/${props.system.avatar}`} />;
  }

  return (
    <Avatar>
      {String((props.system.username || props.system.user_id || '').toString())
        .charAt(0)
        .toUpperCase()}
    </Avatar>
  );
}
