import { useState, useEffect } from 'react';
import { apiClient, type ApiAlter } from '@didhub/api-client';
import logger from '../lib/logger';

/**
 * Hook to manage alters data for a system
 */
export function useAltersData(
  uid?: string,
  search: string = '',
  activeTab: number = 0,
  page: number = 0,
  pageSize: number = 20,
) {
  const [items, setItems] = useState<ApiAlter[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!uid || activeTab !== 0) {
      setItems([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    const offset = Math.max(0, page) * Math.max(1, pageSize);

    const load = async () => {
      try {
        setLoading(true);
        const pageResult = await apiClient.alter.get_alters({
          userId: uid,
          query: search,
          includeRelationships: true,
          perPage: pageSize,
          offset,
        });
        if (cancelled) return;
        const payload = pageResult.data;
        const items = Array.isArray(payload?.items) ? (payload.items as unknown as ApiAlter[]) : [];
        setItems(items);
        setTotal(payload?.total ?? 0);
      } catch (e) {
        logger.warn('failed loading alters', e);
        if (!cancelled) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [uid, activeTab, search, page, pageSize]);

  const refresh = async () => {
    if (!uid || activeTab !== 0) return;
    try {
      const offset = Math.max(0, page) * Math.max(1, pageSize);
      const pageResult = await apiClient.alter.get_alters({
        userId: uid,
        query: search,
        includeRelationships: true,
        perPage: pageSize,
        offset,
      });
      const payload = pageResult.data;
      const items = Array.isArray(payload?.items) ? (payload.items as unknown as ApiAlter[]) : [];
      setItems(items);
      setTotal(payload?.total ?? 0);
    } catch (e) {
      logger.warn('refreshAlters failed', e);
    }
  };

  return { items, loading, total, refresh };
}
