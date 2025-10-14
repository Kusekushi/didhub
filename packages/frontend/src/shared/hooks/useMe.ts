import { useState, useEffect } from 'react';
import * as authService from '../../services/authService';

export async function getMe() {
  try {
    return await authService.getMe();
  } catch {
    return null;
  }
}

export function useMe() {
  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  return { me, loading, refetch: () => getMe().then(setMe) };
}
