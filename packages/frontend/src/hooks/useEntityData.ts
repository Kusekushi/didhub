import { useState, useEffect } from 'react';

export interface EntityFetchFilters {
  ownerUserId: string;
  query?: string;
  includeMembers?: boolean;
}

/**
 * Generic hook for managing entity data (groups, subsystems, etc.) for a system
 */
export function useEntityData<T>(
  targetTab: number,
  fetchFunction: (filters: EntityFetchFilters) => Promise<T[]>,
  uid?: string,
  search: string = '',
  activeTab: number = 0,
) {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (activeTab !== targetTab || !uid) return;

    (async () => {
      try {
        const fetched = await fetchFunction({
          ownerUserId: uid,
          query: search,
          includeMembers: true,
        });
        setItems(fetched || []);
      } catch {
        // Ignore errors when fetching entities
      }
    })();
  }, [activeTab, uid, search, targetTab, fetchFunction]);

  const refresh = async () => {
    if (!uid) return;
    try {
      const fetched = await fetchFunction({ ownerUserId: uid, query: search });
      setItems(fetched || []);
    } catch {
      // Ignore errors when refreshing entities
    }
  };

  return { items, refresh };
}
