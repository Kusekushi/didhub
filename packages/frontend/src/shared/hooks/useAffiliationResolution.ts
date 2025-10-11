import { useState, useEffect } from 'react';
import { apiClient, type Group } from '@didhub/api-client';
import { normalizeEntityId } from '../utils/alterFormUtils';

/**
 * Hook to resolve affiliations for an alter without fetching the full alter data
 */
export function useAffiliationResolution(affiliations: any) {
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<Record<string, Group>>({});
  // keys are string ids (UUID or numeric string)
  const [affiliationIdMap, setAffiliationIdMap] = useState<Record<string, Group>>({});

  useEffect(() => {
    if (!affiliations) return;
    resolveAffiliations(affiliations);
  }, [affiliations]);

  function coerceStringId(raw: unknown): string | null {
    if (raw == null) return null;
    const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!s) return null;
    return s.replace(/^#/u, '');
  }

  async function resolveAffiliations(affiliationData: any) {
    try {
      const affiliations = Array.isArray(affiliationData) ? affiliationData : [affiliationData];
      const map: Record<string, Group> = {};
      const idMap: Record<string, Group> = {};

      for (const rawName of affiliations) {
        // Try direct id lookup using normalized entity id
        const maybeId = normalizeEntityId(rawName);
        if (maybeId) {
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

        // Name-based lookup
        const name = Array.isArray(rawName) ? rawName.join(',') : String(rawName);
        try {
          const response = await apiClient.group.get_groups({ query: name || '', includeMembers: true });
          const items = Array.isArray(response.data?.items) ? (response.data?.items as unknown[]) : [];
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
