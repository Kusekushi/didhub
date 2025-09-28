import React from 'react';
import { Avatar } from '@mui/material';

type System = any;

interface SystemAvatarProps {
  system: System;
}

/**
 * Component for displaying system avatar
 */
export default function SystemAvatar({ system }: SystemAvatarProps) {
  if (system.avatar) {
    return <Avatar src={`/uploads/${system.avatar}`} />;
  }

  return (
    <Avatar>
      {String((system.username || system.user_id || '').toString())
        .charAt(0)
        .toUpperCase()}
    </Avatar>
  );
}