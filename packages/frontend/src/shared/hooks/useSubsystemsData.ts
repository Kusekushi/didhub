import { useCallback } from 'react';
import { EntityFetchFilters, useEntityData } from './useEntityData';
import { listSubsystems } from '../../services/subsystemService';

type Subsystem = any;

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
      const response = await listSubsystems({ owner_user_id, query, includeMembers, limit, offset } as any);
      if (response && typeof response === 'object' && 'items' in (response as unknown as Record<string, unknown>)) {
        return response as { items: Subsystem[]; total?: number; limit?: number; offset?: number };
      }
      return { items: [], total: 0, limit, offset };
    },
    [],
  );

  return useEntityData<Subsystem>(2, fetchSubsystems, uid, search, activeTab, page, pageSize);
}
