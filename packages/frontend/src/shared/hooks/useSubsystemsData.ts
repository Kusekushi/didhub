import { useCallback } from 'react';
import { apiClient, type Subsystem } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { subsystem } = apiClient;

/**
 * Hook to manage subsystems data for a system
 */
export function useSubsystemsData(
  uid?: string,
  search: string = '',
  activeTab: number = 0,
  page: number = 0,
  pageSize: number = 20,
) {
  const fetchSubsystems = useCallback(
    async ({ owner_user_id, query, includeMembers, limit, offset }: EntityFetchFilters) => {
      const response = await subsystem.get_subsystems({ owner_user_id, query, includeMembers, limit, offset });
      const payload = response.data as unknown;
      if (payload && typeof payload === 'object' && 'items' in (payload as Record<string, unknown>)) {
        return payload as { items: Subsystem[]; total?: number; limit?: number; offset?: number };
      }
      return { items: [], total: 0, limit, offset };
    },
    [subsystem],
  );

  return useEntityData<Subsystem>(2, fetchSubsystems, uid, search, activeTab, page, pageSize);
}
