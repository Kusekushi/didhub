import { useState, useEffect } from 'react';
import { apiClient, ApiSystemSummary } from '@didhub/api-client';

/**
 * Hook for managing system list data and search
 */
export function useSystemList() {
  const [systems, setSystems] = useState<ApiSystemSummary[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Load systems
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.subsystem.get_systems();
        const data = res && Array.isArray((res as any).data) ? (res as any).data : [];
        setSystems(data);
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
