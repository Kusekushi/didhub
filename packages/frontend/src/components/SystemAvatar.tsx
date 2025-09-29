import React from 'react';
import { Avatar } from '@mui/material';

type System = any;

export interface SystemAvatarProps {
  system: System;
}

/**
 * Component for displaying system avatar
 */
export default function SystemAvatar(props: SystemAvatarProps) {
  if (props.system.avatar) {
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
