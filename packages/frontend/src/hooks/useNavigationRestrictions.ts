import { useLocation } from 'react-router-dom';

interface UseNavigationRestrictionsProps {
  mustChange: boolean;
}

/**
 * Hook for managing navigation restrictions when password change is required
 */
export function useNavigationRestrictions({ mustChange }: UseNavigationRestrictionsProps) {
  const location = useLocation();

  // Enforce navigation restrictions when mustChange is true
  const allowedDuringMustChange = ['/login', '/user-settings', '/', '/register'];

  if (mustChange) {
    const path = location.pathname;
    const allowed = allowedDuringMustChange.some((p) => path === p || path.startsWith('/login'));
    return { shouldRedirect: !allowed, redirectTo: '/user-settings' };
  }

  return { shouldRedirect: false };
}