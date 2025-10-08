import { useState, useEffect } from 'react';
import { apiClient } from '@didhub/api-client';
import type { User } from '@didhub/api-client';

export type SystemSummary = User & { description?: string | null };

/**
 * Hook for managing system list data and search
 */
export function useSystemList() {
  const [systems, setSystems] = useState<SystemSummary[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Load systems
  useEffect(() => {
    (async () => {
      try {
        const s = await apiClient.users.systems();
        setSystems(s || []);
      } catch (e) {
        setSystems([]);
      }
    })();
  }, []);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Filter systems based on search query
  const filteredSystems = systems.filter((s) => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    return (
      String(s.username || '')
        .toLowerCase()
        .includes(q) ||
      String(s.user_id || '')
        .toLowerCase()
        .includes(q)
    );
  });

  const clearSearch = () => {
    setQuery('');
    setDebouncedQuery('');
  };

  return {
    systems: filteredSystems,
    query,
    setQuery,
    clearSearch,
    hasQuery: !!query,
  };
}
