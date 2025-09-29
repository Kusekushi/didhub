import { useState, useEffect } from 'react';
import { fetchAltersSearch, Alter } from '@didhub/api-client';

/**
 * Hook to manage alter options for leader selection
 */
export function useAlterOptions(uid?: string, leaderQuery: string = '') {
  const [altersOptions, setAltersOptions] = useState<Alter[]>([]);

  useEffect(() => {
    if (!uid) return;

    let mounted = true;
    const t = setTimeout(async () => {
      try {
        const q = leaderQuery ? leaderQuery : '';
        const j = (await fetchAltersSearch(uid, q)) as any;
        if (!mounted) return;
        setAltersOptions(j || j.items || []);
      } catch {
        // Ignore errors when fetching alter options
      }
    }, 300);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [leaderQuery, uid]);

  return { altersOptions };
}
