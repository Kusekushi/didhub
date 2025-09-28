import { getShortlinkRecord } from '@didhub/api-client';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function SRedirect(): React.ReactElement {
  const { token } = useParams() as { token?: string };
  const nav = useNavigate();
  const [msg, setMsg] = useState('Redirecting...');

  useEffect(() => {
    (async () => {
      if (!token) return setMsg('Invalid token');
      try {
        const record = await getShortlinkRecord(token);
        if ('status' in record) return setMsg('Not found');
        if (record.target_type === 'alter') return nav(`/detail/${record.target_id}`);
        if (record.target_type === 'group') return nav(`/groups/${record.target_id}`);
        if (record.target_type === 'subsystem') return nav(`/subsystems/${record.target_id}`);
        setMsg('Unknown target');
      } catch (e) {
        setMsg('Redirect failed');
      }
    })();
  }, [token, nav]);

  return <div style={{ padding: 16 }}>{msg}</div>;
}
