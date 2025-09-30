import { useState, useEffect } from 'react';
import { apiClient, type Alter } from '@didhub/api-client';
import logger from '../logger';

/**
 * Hook to manage alters data for a system
 */
export function useAltersData(uid?: string, search: string = '') {
  const [items, setItems] = useState<Alter[]>([]);
  const [loading, setLoading] = useState(false);

  // Initial load
  useEffect(() => {
    if (!uid) return;

    (async () => {
      try {
        const result = await apiClient.alters.listBySystem(uid, { includeRelationships: true });
        setItems(result);
      } catch (e) {
        logger.warn('failed loading alters', e);
        setItems([]);
      }
    })();
  }, [uid]);

  // Search with debouncing
  useEffect(() => {
    if (!uid) return;

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
