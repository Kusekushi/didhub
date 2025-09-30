import React from 'react';
import SystemList from '../components/SystemList';

export default function Systems() {
  return (
    <SystemList
      title="Systems"
      primary={(system) => `${system.username ?? ''} (${system.user_id ?? ''})`}
      secondary={(system) => system.display_name ?? ''}
    />
  );
}
