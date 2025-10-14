import { useCallback } from 'react';
import { EntityFetchFilters, useEntityData } from './useEntityData';
import * as groupService from '../../services/groupService';

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
      groupService.listGroups({ owner_user_id, query, includeMembers, limit, offset }),
    [],
  );

  return useEntityData<any>(1, fetchGroups, uid, search, activeTab, page, pageSize);
}
