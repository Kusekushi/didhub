import { useState, useEffect } from 'react';
import * as groupService from '../../services/groupService';
import { normalizeEntityId } from '../utils/alterFormUtils';

/**
 * Hook to resolve affiliations for an alter without fetching the full alter data
 */
export function useAffiliationResolution(affiliations: any) {
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<Record<string, any>>({});
  // keys are string ids (UUID or numeric string)
  const [affiliationIdMap, setAffiliationIdMap] = useState<Record<string, any>>({});

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
  const map: Record<string, any> = {};
  const idMap: Record<string, any> = {};

      for (const rawName of affiliations) {
        // Try direct id lookup using normalized entity id
        const maybeId = normalizeEntityId(rawName);
        if (maybeId) {
          try {
            const group = await groupService.getGroupById(maybeId as any);
            if (group) {
              idMap[maybeId] = group as any;
              continue;
            }
          } catch (e) {
            // Fall through to name-based lookup
          }
        }

        // Name-based lookup
        const name = Array.isArray(rawName) ? rawName.join(',') : String(rawName);
        try {
          const res = await groupService.listGroups({ query: name || '', includeMembers: true });
          const items = Array.isArray(res?.items) ? res.items : [];
          const found = items.find((it: any) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase());
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
