import React from 'react';
import SystemList from '../components/SystemList';

export default function Systems() {
  return (
    <SystemList
      title="Systems"
      primary={(s: any) => `${s.username} (${s.user_id})`}
      secondary={(s: any) => s.display_name || ''}
    />
  );
}
