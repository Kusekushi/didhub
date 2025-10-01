import { useCallback } from 'react';
import { apiClient, type Group } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { groups } = apiClient;

/**
 * Hook to manage groups data for a system
 */
export function useGroupsData(uid?: string, search: string = '', activeTab: number = 0) {
  const fetchGroups = useCallback(
    ({ ownerUserId, query, includeMembers }: EntityFetchFilters) =>
      groups.list({ ownerUserId, query, includeMembers }),
    [groups],
  );

  return useEntityData<Group>(1, fetchGroups, uid, search, activeTab);
}
