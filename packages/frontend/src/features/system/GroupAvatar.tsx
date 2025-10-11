import React from 'react';
import { Avatar } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { Group } from '@didhub/api-client';

import ThumbnailWithHover from '../../components/ui/ThumbnailWithHover';

export interface GroupAvatarProps {
  group: Group;
}

/**
 * Component for displaying group avatar/sigil
 */
export default function GroupAvatar(props: GroupAvatarProps) {
  const nav = useNavigate();

  try {
    const raw = (props.group as { sigil?: unknown }).sigil;
    const url = typeof raw === 'string' ? raw.trim() : raw ? String(raw) : '';

    if (url) {
      const isImg = /^(https?:\/\/|data:|blob:|\/)/i.test(url);
      if (isImg) {
        return (
          <div style={{ marginRight: 4 }}>
            <ThumbnailWithHover
              image={url}
              alt={props.group.name || ''}
              onClick={() => nav(`/groups/${props.group.id}`)}
            />
          </div>
        );
      }
      return (
        <Avatar variant="rounded" sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#e0e0e0', color: '#555' }}>
          {String(url).slice(0, 2).toUpperCase()}
        </Avatar>
      );
    }
  } catch {}

  return (
    <Avatar variant="rounded" sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#f0f0f0', color: '#777' }}>
      {(props.group.name || '#').slice(0, 1).toUpperCase()}
    </Avatar>
  );
}
