import { useState, useEffect } from 'react';
import RequestCache from './utils/requestCache';
import { searchAlters } from '../../services/alterService';

type ApiRoutesAltersNamesItem = any;

// shared cache instance used by the hook
const altersRequestCache = new RequestCache(5_000);

/**
 * Hook to manage alter options for leader selection
 */
export function useAlterOptions(uid?: string, leaderQuery: string = '', enabled = true) {
  const [altersOptions, setAltersOptions] = useState<ApiRoutesAltersNamesItem[]>([]);

  useEffect(() => {
    if (!uid || !enabled) return;

    let mounted = true;
    const t = setTimeout(async () => {
      try {
        const q = leaderQuery ? leaderQuery : '';
        const key = `${uid}:${q}`;

        const options = await altersRequestCache.fetch<ApiRoutesAltersNamesItem[]>(key, async () => {
          const response = await searchAlters({ userId: uid, query: q, includeRelationships: true } as any);
          return Array.isArray(response?.items) ? (response.items as ApiRoutesAltersNamesItem[]) : [];
        });

        if (!mounted) return;
        setAltersOptions(options);
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
