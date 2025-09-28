import React from 'react';
import SystemList from '../components/SystemList';

export default function Dashboard(): React.ReactElement {
  return (
    <SystemList
      title="Available Systems"
      header={<div style={{ marginBottom: 8 }}>These are the registered DID-system accounts you can view.</div>}
    />
  );
}
