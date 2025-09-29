import { useState, useEffect } from 'react';

/**
 * Generic hook for managing entity data (groups, subsystems, etc.) for a system
 */
export function useEntityData<T>(
  targetTab: number,
  fetchFunction: (query: string, includeMembers?: boolean) => Promise<any>,
  uid?: string,
  search: string = '',
  activeTab: number = 0,
) {
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (activeTab !== targetTab || !uid) return;

    (async () => {
      try {
        const q = search ? '&q=' + encodeURIComponent(search) : '';
        const query = q ? '?owner_user_id=' + encodeURIComponent(uid) + q : '?owner_user_id=' + encodeURIComponent(uid);
        const j: any = await fetchFunction(query, true);
        setItems((j as any).items || j || []);
      } catch {
        // Ignore errors when fetching entities
      }
    })();
  }, [activeTab, uid, search, targetTab, fetchFunction]);

  const refresh = async () => {
    if (!uid) return;
    try {
      const q = search ? '&q=' + encodeURIComponent(search) : '';
      const query = q ? '?owner_user_id=' + encodeURIComponent(uid) + q : '?owner_user_id=' + encodeURIComponent(uid);
      const j: any = await fetchFunction(query);
      setItems((j as any).items || j || []);
    } catch {
      // Ignore errors when refreshing entities
    }
  };

  return { items, refresh };
}
