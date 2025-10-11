import { useState, useEffect } from 'react';
import { apiClient } from '@didhub/api-client';

export async function getMe() {
  try {
    const result = await apiClient.users.get_me();
    return result.data;
  } catch {
    return null;
  }
}

export function useMe() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  return { me, loading, refetch: () => getMe().then(setMe) };
}
