import { Group, listGroups } from '@didhub/api-client';
import { useEntityData } from './useEntityData';

/**
 * Hook to manage groups data for a system
 */
export function useGroupsData(uid?: string, search: string = '', activeTab: number = 0) {
  return useEntityData<Group>(1, listGroups, uid, search, activeTab);
}
