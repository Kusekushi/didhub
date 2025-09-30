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
        if (!record.target) return setMsg('Unknown target');
        return nav(record.target);
      } catch (e) {
        setMsg('Redirect failed');
      }
    })();
  }, [token, nav]);

  return <div style={{ padding: 16 }}>{msg}</div>;
}
