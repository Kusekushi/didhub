import { useState, useEffect } from 'react';
import { apiClient, type ApiRoutesAltersNamesItem } from '@didhub/api-client';
import RequestCache from './utils/requestCache';

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
          const response = await apiClient.alter.get_alters_search({
            userId: uid,
            query: q,
            includeRelationships: true,
          });
          const payload = response.data;
          return Array.isArray(payload?.items) ? (payload.items as unknown as ApiRoutesAltersNamesItem[]) : [];
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
