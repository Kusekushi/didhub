import { useCallback } from 'react';
import { apiClient, type Subsystem } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { subsystems } = apiClient;

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
    ({ owner_user_id, query, includeMembers, limit, offset }: EntityFetchFilters) =>
      subsystems.listPaged({ owner_user_id, query, includeMembers, limit, offset }),
    [subsystems],
  );

  return useEntityData<Subsystem>(2, fetchSubsystems, uid, search, activeTab, page, pageSize);
}
