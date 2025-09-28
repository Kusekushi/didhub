import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';
import { fetchMe } from '@didhub/api-client';

export default function RedirectToSystem() {
  const { user: me } = useAuth() as any;
  const nav = useNavigate();
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (me) {
          if (me.is_system) {
            if (mounted) nav(`/did-system/${me.id}`, { replace: true });
            return;
          }
          if (mounted) nav('/', { replace: true });
          return;
        }
        const userOrError = await fetchMe();
        if (!mounted) return;
        if (!('ok' in userOrError)) {
          if (userOrError.is_system) {
            nav(`/did-system/${userOrError.id}`, { replace: true });
            return;
          }
        }
        if (mounted) nav('/', { replace: true });
      } catch (e) {
        if (mounted) nav('/', { replace: true });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [me, nav]);
  return null;
}
