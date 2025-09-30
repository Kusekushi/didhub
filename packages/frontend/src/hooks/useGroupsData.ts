import { apiClient, type Group } from '@didhub/api-client';
import { useEntityData } from './useEntityData';

const { groups } = apiClient;

/**
 * Hook to manage groups data for a system
 */
export function useGroupsData(uid?: string, search: string = '', activeTab: number = 0) {
  return useEntityData<Group>(
    1,
    async ({ ownerUserId, query, includeMembers }) => groups.list({ ownerUserId, query, includeMembers }),
    uid,
    search,
    activeTab,
  );
}
