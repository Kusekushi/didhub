import { useCallback } from 'react';
import { apiClient, type Group } from '@didhub/api-client';
import { EntityFetchFilters, useEntityData } from './useEntityData';

const { group } = apiClient;

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
    ({ owner_user_id, query, includeMembers, limit, offset }: EntityFetchFilters) =>
      group.get_groups({ owner_user_id, query, includeMembers, limit, offset }),
    [group],
  );

  return useEntityData<Group>(1, fetchGroups, uid, search, activeTab, page, pageSize);
}
