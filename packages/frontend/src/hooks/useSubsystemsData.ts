import { useCallback } from 'react';
import { apiClient, type Subsystem } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { subsystems } = apiClient;

/**
 * Hook to manage subsystems data for a system
 */
export function useSubsystemsData(uid?: string, search: string = '', activeTab: number = 0) {
  const fetchSubsystems = useCallback(
    ({ ownerUserId, query, includeMembers }: EntityFetchFilters) =>
      subsystems.list({ ownerUserId, query, includeMembers }),
    [subsystems],
  );

  return useEntityData<Subsystem>(2, fetchSubsystems, uid, search, activeTab);
}
