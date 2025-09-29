import { useCallback } from 'react';
import { Subsystem, listSubsystems } from '@didhub/api-client';
import { useEntityData } from './useEntityData';

/**
 * Hook to manage subsystems data for a system
 */
export function useSubsystemsData(uid?: string, search: string = '', activeTab: number = 0) {
  // Wrapper to match the expected function signature
  const fetchSubsystems = useCallback(async (query: string, includeMembers?: boolean) => {
    return listSubsystems(query, undefined, includeMembers);
  }, []);

  return useEntityData<Subsystem>(2, fetchSubsystems, uid, search, activeTab);
}
