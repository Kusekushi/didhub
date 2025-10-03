import { useCallback } from 'react';
import { apiClient, type Group } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { groups } = apiClient;

/**
 * Hook to manage groups data for a system
 */
export function useGroupsData(
  uid?: string,
  search: string = '',
  activeTab: number = 0,
  page: number = 0,
  pageSize: number = 20,
) {
  const fetchGroups = useCallback(
    ({ ownerUserId, query, includeMembers, limit, offset }: EntityFetchFilters) =>
      groups.listPaged({ ownerUserId, query, includeMembers, limit, offset }),
    [groups],
  );

  return useEntityData<Group>(1, fetchGroups, uid, search, activeTab, page, pageSize);
}
