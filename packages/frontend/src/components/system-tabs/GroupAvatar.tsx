import React from 'react';
import { Avatar } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import ThumbnailWithHover from '../ThumbnailWithHover';

interface GroupAvatarProps {
  group: {
    id?: number | string;
    name?: string;
    sigil?: string | string[];
  };
}

/**
 * Component for displaying group avatar/sigil
 */
export default function GroupAvatar({ group }: GroupAvatarProps) {
  const nav = useNavigate();

  try {
    const raw = (group as any).sigil;
    let firstUrl: string | null = null;

    if (Array.isArray(raw)) {
      firstUrl = raw[0] || null;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[')) {
        try {
          const arr = JSON.parse(trimmed);
          if (Array.isArray(arr) && arr.length) firstUrl = arr[0];
        } catch {}
      } else if (trimmed.includes(',')) {
        firstUrl = trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)[0] || null;
      } else if (trimmed) {
        firstUrl = trimmed;
      }
    }

    if (firstUrl) {
      const isImg = /^(https?:\/\/|data:|blob:|\/)/i.test(firstUrl);
      if (isImg) {
        return (
          <div style={{ marginRight: 4 }}>
            <ThumbnailWithHover
              image={firstUrl}
              alt={group.name || ''}
              onClick={() => nav(`/groups/${group.id}`)}
            />
          </div>
        );
      }
      return (
        <Avatar
          variant="rounded"
          sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#e0e0e0', color: '#555' }}
        >
          {String(firstUrl).slice(0, 2).toUpperCase()}
        </Avatar>
      );
    }
  } catch {}

  return (
    <Avatar
      variant="rounded"
      sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#f0f0f0', color: '#777' }}
    >
      {(group.name || '#').slice(0, 1).toUpperCase()}
    </Avatar>
  );
}