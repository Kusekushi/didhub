import { useState, useEffect } from 'react';
import { listUsers } from '../../services/adminService';
import { ApiUser } from '@didhub/api-client';

/**
 * Hook for managing system list data and search
 */
export function useSystemList() {
  const [systems, setSystems] = useState<ApiUser[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Load systems
  useEffect(() => {
    (async () => {
      try {
        const res = await listUsers({ is_system: '1', is_approved: '1' });
        const payload = res ?? null;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setSystems(items);
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
      String(s.id || '')
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
