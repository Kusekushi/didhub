import { useState, useEffect } from 'react';
import { apiClient, type Alter } from '@didhub/api-client';
import logger from '../logger';

/**
 * Hook to manage alters data for a system
 */
export function useAltersData(uid?: string, search: string = '', activeTab: number = 0) {
  const [items, setItems] = useState<Alter[]>([]);
  const [loading, setLoading] = useState(false);

  // Initial load
  useEffect(() => {
    // Only load when UID is present and the alters tab is active (tab 0)
    if (!uid || activeTab !== 0) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const result = await apiClient.alters.listBySystem(uid, { includeRelationships: true });
        if (!mounted) return;
        setItems(result);
      } catch (e) {
        logger.warn('failed loading alters', e);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [uid, activeTab]);

  // Search with debouncing
  useEffect(() => {
    // Only search when the alters tab is active
    if (!uid || activeTab !== 0) return;

    let mounted = true;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const result = await apiClient.alters.search({ userId: uid, query: search, includeRelationships: true });
        if (!mounted) return;
        setItems(result);
      } catch {
        // Ignore errors when searching alters
      } finally {
        if (mounted) setLoading(false);
      }
    }, 350);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [search, uid]);

  const refresh = async () => {
    if (!uid) return;
    try {
      const result = await apiClient.alters.search({ userId: uid, query: search, includeRelationships: true });
      setItems(result);
    } catch (e) {
      logger.warn('refreshAlters failed', e);
    }
  };

  return { items, loading, refresh };
}
