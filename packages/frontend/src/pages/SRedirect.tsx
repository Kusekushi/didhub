import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@didhub/api-client';

export default function SRedirect(): React.ReactElement {
  const { token } = useParams() as { token?: string };
  const nav = useNavigate();
  const [msg, setMsg] = useState('Redirecting...');

  useEffect(() => {
    (async () => {
      if (!token) return setMsg('Invalid token');
      try {
        const result = await apiClient.shortlinks.fetch(token);
        if (!result.ok || !result.record) return setMsg('Not found');
        if (!result.record.target) return setMsg('Unknown target');
        return nav(result.record.target);
      } catch (e) {
        setMsg('Redirect failed');
      }
    })();
  }, [token, nav]);

  return <div style={{ padding: 16 }}>{msg}</div>;
}
