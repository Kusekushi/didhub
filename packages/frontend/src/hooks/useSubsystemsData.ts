import { apiClient, type Subsystem } from '@didhub/api-client';
import { useEntityData } from './useEntityData';

const { subsystems } = apiClient;

/**
 * Hook to manage subsystems data for a system
 */
export function useSubsystemsData(uid?: string, search: string = '', activeTab: number = 0) {
  return useEntityData<Subsystem>(
    2,
    async ({ ownerUserId, query, includeMembers }) => subsystems.list({ ownerUserId, query, includeMembers }),
    uid,
    search,
    activeTab,
  );
}
