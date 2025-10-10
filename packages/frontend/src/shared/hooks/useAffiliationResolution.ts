import { useState, useEffect } from 'react';
import { apiClient, type Group } from '@didhub/api-client';

/**
 * Hook to resolve affiliations for an alter without fetching the full alter data
 */
export function useAffiliationResolution(affiliations: any) {
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<Record<string, Group>>({});
  const [affiliationIdMap, setAffiliationIdMap] = useState<Record<number, Group>>({});

  useEffect(() => {
    if (!affiliations) return;
    resolveAffiliations(affiliations);
  }, [affiliations]);

  async function resolveAffiliations(affiliationData: any) {
    try {
      const affiliations = Array.isArray(affiliationData) ? affiliationData : [affiliationData];
      const map: Record<string, Group> = {};
      const idMap: Record<number, Group> = {};

      for (const rawName of affiliations) {
        // Try numeric ID first
        if (typeof rawName === 'number' || typeof rawName === 'string') {
          const trimmed = typeof rawName === 'string' ? rawName.trim() : String(rawName);
          if (trimmed.length > 0) {
            const maybeId = Number(trimmed);
            if (!Number.isNaN(maybeId)) {
              try {
                const response = await apiClient.group.get_groups_by_id(maybeId);
                const group = response.data;
                if (group) {
                  idMap[maybeId] = group as Group;
                  continue;
                }
              } catch (e) {
                // Fall through to name-based lookup
              }
            }
          }
        }

        // Name-based lookup
        const name = Array.isArray(rawName) ? rawName.join(',') : String(rawName);
        try {
          const response = await apiClient.group.get_groups({ query: name || '', includeMembers: true });
          const items = Array.isArray(response.data?.items)
            ? (response.data?.items as unknown[])
            : [];
          const found = (items as Group[]).find(
            (it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase(),
          );
          if (found) map[name] = found;
        } catch (e) {
          // Ignore individual lookup errors
        }
      }

      setAffiliationGroupsMap(map);
      setAffiliationIdMap(idMap);
    } catch (e) {
      setAffiliationGroupsMap({});
      setAffiliationIdMap({});
    }
  }

  return {
    affiliationGroupsMap,
    affiliationIdMap,
  };
}
