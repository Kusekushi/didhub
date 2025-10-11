import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@didhub/api-client';

import { useAuth } from '../../shared/contexts/AuthContext';

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
        const session = await apiClient.users.session();
        if (!mounted) return;
        if (session.ok && session.user && session.user.is_system) {
          nav(`/did-system/${session.user.id}`, { replace: true });
          return;
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
