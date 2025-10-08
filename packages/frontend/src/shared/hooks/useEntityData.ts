import { useState, useEffect } from 'react';

export interface EntityFetchFilters {
  owner_user_id: string | number;
  query?: string;
  includeMembers?: boolean;
  limit?: number;
  offset?: number;
}

const ENTITY_DEBUG_STORE_KEY = '__DIDHUB_ENTITY_LOGS__';
const MAX_ENTITY_DEBUG_ENTRIES = 100;

function isEntityDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const globalAny = window as unknown as Record<string, unknown>;
  if (globalAny.__DIDHUB_ENTITY_DEBUG__ === false) return false;
  if (globalAny.__DIDHUB_ENTITY_DEBUG__ === true) return true;
  try {
    const stored = window.localStorage.getItem('didhub-debug-entities');
    if (stored && ['1', 'true', 'yes', 'on'].includes(stored.toLowerCase())) return true;
  } catch {
    // ignore inaccessible storage (e.g., privacy mode)
  }
  return false;
}

function recordEntityDebug(event: string, payload: Record<string, unknown>): void {
  if (!isEntityDebugEnabled()) return;
  const entry = { event, ts: Date.now(), ...payload } as Record<string, unknown>;
  if (typeof window !== 'undefined') {
    const globalAny = window as unknown as Record<string, unknown>;
    const store = (globalAny[ENTITY_DEBUG_STORE_KEY] as Record<string, unknown>[]) ?? [];
    if (!Array.isArray(store)) {
      globalAny[ENTITY_DEBUG_STORE_KEY] = [entry];
    } else {
      store.push(entry);
      if (store.length > MAX_ENTITY_DEBUG_ENTRIES) store.splice(0, store.length - MAX_ENTITY_DEBUG_ENTRIES);
      globalAny[ENTITY_DEBUG_STORE_KEY] = store;
    }
    globalAny.__DIDHUB_ENTITY_LAST__ = entry;
  }
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[EntityData]', entry);
  }
}

function normalizeOwnerId(uid?: string): string | undefined {
  if (!uid) return undefined;
  const trimmed = uid.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Generic hook for managing entity data (groups, subsystems, etc.) for a system
 */
type EntityFetchResult<T> = { items: T[]; total?: number; limit?: number; offset?: number } | T[];

export function useEntityData<T>(
  targetTab: number,
  fetchFunction: (filters: EntityFetchFilters) => Promise<EntityFetchResult<T>>,
  uid?: string,
  search: string = '',
  activeTab: number = 0,
  page: number = 0,
  pageSize: number = 20,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== targetTab || !uid) {
      setItems([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    const offset = Math.max(0, page) * Math.max(1, pageSize);

    const load = async () => {
      try {
        setLoading(true);
        const ownerId = normalizeOwnerId(uid);
        recordEntityDebug('load:init', {
          hook: 'useEntityData',
          targetTab,
          activeTab,
          uid,
          owner_user_id: ownerId,
          search,
          page,
          pageSize,
          offset,
        });
        if (ownerId == null) {
          recordEntityDebug('load:skipped', {
            reason: 'missing-owner',
            targetTab,
            activeTab,
            uid,
          });
          setItems([]);
          setTotal(0);
          return;
        }
        recordEntityDebug('load:fetch:start', {
          owner_user_id: ownerId,
          targetTab,
          activeTab,
          limit: pageSize,
          offset,
        });
        const fetched = await fetchFunction({
          owner_user_id: ownerId,
          query: search,
          includeMembers: true,
          limit: pageSize,
          offset,
        });
        if (cancelled) return;

        if (Array.isArray((fetched as unknown as { items?: unknown[] }).items)) {
          const pageResult = fetched as unknown as { items: T[]; total?: number; limit?: number; offset?: number };
          setItems(pageResult.items || []);
          setTotal(typeof pageResult.total === 'number' ? pageResult.total : pageResult.items.length);
          recordEntityDebug('load:fetch:success', {
            owner_user_id: ownerId,
            itemCount: pageResult.items?.length ?? 0,
            total: pageResult.total,
            offset,
            limit: pageSize,
          });
        } else if (Array.isArray(fetched)) {
          setItems(fetched);
          setTotal(fetched.length);
          recordEntityDebug('load:fetch:success', {
            owner_user_id: ownerId,
            itemCount: fetched.length,
            total: fetched.length,
            offset,
            limit: pageSize,
          });
        }
      } catch (error) {
        recordEntityDebug('load:error', {
          targetTab,
          activeTab,
          owner_user_id: normalizeOwnerId(uid),
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          recordEntityDebug('load:complete', {
            targetTab,
            activeTab,
            owner_user_id: normalizeOwnerId(uid),
            cancelled,
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeTab, uid, search, targetTab, fetchFunction, page, pageSize]);

  const refresh = async () => {
    if (!uid || activeTab !== targetTab) return;
    try {
      const offset = Math.max(0, page) * Math.max(1, pageSize);
      const ownerId = normalizeOwnerId(uid);
      if (ownerId == null) return;
      recordEntityDebug('refresh:start', {
        targetTab,
        activeTab,
        owner_user_id: ownerId,
        search,
        page,
        pageSize,
        offset,
      });
      const fetched = await fetchFunction({
        owner_user_id: ownerId,
        query: search,
        includeMembers: true,
        limit: pageSize,
        offset,
      });
      if (Array.isArray((fetched as unknown as { items?: unknown[] }).items)) {
        const pageResult = fetched as unknown as { items: T[]; total?: number };
        setItems(pageResult.items || []);
        setTotal(typeof pageResult.total === 'number' ? pageResult.total : pageResult.items.length);
        recordEntityDebug('refresh:success', {
          owner_user_id: ownerId,
          itemCount: pageResult.items?.length ?? 0,
          total: pageResult.total,
        });
      } else if (Array.isArray(fetched)) {
        setItems(fetched || []);
        setTotal(fetched.length);
        recordEntityDebug('refresh:success', {
          owner_user_id: ownerId,
          itemCount: fetched.length,
          total: fetched.length,
        });
      }
    } catch (error) {
      // Ignore errors when refreshing entities
      recordEntityDebug('refresh:error', {
        targetTab,
        activeTab,
        owner_user_id: normalizeOwnerId(uid),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return { items, total, loading, refresh };
}
