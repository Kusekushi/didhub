import { useState, useEffect } from 'react';
import {
  getAlter,
  fetchMeVerified,
  getGroup,
  listGroups,
  getSubsystem,
  listSubsystems,
  Alter,
  Group,
  User,
  Subsystem,
} from '@didhub/api-client';

/**
 * Hook to manage alter data and related entities (group, subsystem, affiliations)
 */
export function useAlterData(id?: string) {
  const [alter, setAlter] = useState<Alter | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [groupObj, setGroupObj] = useState<Group | null>(null);
  const [affiliationGroup, setAffiliationGroup] = useState<Group | null>(null);
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<Record<string, Group>>({});
  const [affiliationIdMap, setAffiliationIdMap] = useState<Record<number | string, Group>>({});
  const [subsystemObj, setSubsystemObj] = useState<Subsystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [alterResult, userResult] = await Promise.all([getAlter(id), fetchMeVerified()]);

        setAlter(alterResult);
        setUser(userResult);

        // Handle group resolution
        if (alterResult?.group !== undefined && alterResult?.group !== null) {
          try {
            const group = await getGroup(alterResult.group as string | number);
            setGroupObj(group);
          } catch (e) {
            setGroupObj(null);
          }
          setAffiliationGroup(null);
        } else {
          setGroupObj(null);
          setAffiliationGroup(null);
          // Handle affiliations
          const affiliationData = alterResult?.affiliation || alterResult?.affiliations;
          if (alterResult && affiliationData) {
            await resolveAffiliations(affiliationData);
          }
        }

        // Handle subsystem resolution
        if (alterResult?.subsystem || alterResult?.subsystem === 0) {
          await resolveSubsystem(alterResult.subsystem);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load alter data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  async function resolveAffiliations(affiliationData: any) {
    try {
      const affiliations = Array.isArray(affiliationData) ? affiliationData : [affiliationData];
      const map: Record<string, Group> = {};
      const idMap: Record<number | string, Group> = {};

      for (const rawName of affiliations) {
        // Try numeric ID first
        if (typeof rawName === 'number' || (!Number.isNaN(Number(rawName)) && String(rawName).trim() !== '')) {
          const maybeId = typeof rawName === 'number' ? rawName : Number(rawName);
          if (!Number.isNaN(maybeId)) {
            try {
              const group = await getGroup(maybeId);
              if (group) idMap[maybeId] = group;
              continue;
            } catch (e) {
              // Fall through to name-based lookup
            }
          }
        }

        // Name-based lookup
        const name = Array.isArray(rawName) ? rawName.join(',') : String(rawName);
        try {
          const groups = await listGroups(name || '', true);
          const items = groups && (groups as any).items ? (groups as any).items : Array.isArray(groups) ? groups : [];
          const found = (items as any[]).find(
            (it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase(),
          );
          if (found) map[name] = found as Group;
        } catch (e) {
          // Ignore individual lookup errors
        }
      }

      setAffiliationGroupsMap(map);
      setAffiliationIdMap(idMap);
    } catch (e) {
      setAffiliationGroupsMap({});
    }
  }

  async function resolveSubsystem(rawSubsystem: any) {
    try {
      const rawStr = String(rawSubsystem);
      const maybeId = typeof rawSubsystem === 'number' ? rawSubsystem : Number(rawStr);

      if (!Number.isNaN(maybeId) && rawStr.trim() !== '') {
        try {
          const subsystem = await getSubsystem(maybeId);
          if (subsystem) {
            setSubsystemObj(subsystem);
            return;
          }
        } catch (e) {
          // Fall through to name lookup
        }
      }

      // Name lookup fallback
      const subsystems = await listSubsystems(rawStr || '', undefined, true);
      const items =
        subsystems && (subsystems as any).items
          ? (subsystems as any).items
          : Array.isArray(subsystems)
            ? subsystems
            : [];
      const found = (items as any[]).find(
        (it) => it && it.name && String(it.name).toLowerCase() === rawStr.toLowerCase(),
      );
      if (found) setSubsystemObj(found as Subsystem);
    } catch (e) {
      setSubsystemObj(null);
    }
  }

  const refetch = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [alterResult, userResult] = await Promise.all([getAlter(id), fetchMeVerified()]);

      setAlter(alterResult);
      setUser(userResult);

      // Handle group resolution
      if (alterResult?.group !== undefined && alterResult?.group !== null) {
        try {
          const group = await getGroup(alterResult.group as string | number);
          setGroupObj(group);
        } catch (e) {
          setGroupObj(null);
        }
        setAffiliationGroup(null);
      } else {
        setGroupObj(null);
        setAffiliationGroup(null);
        // Handle affiliations
        const affiliationData = alterResult?.affiliation || alterResult?.affiliations;
        if (alterResult && affiliationData) {
          await resolveAffiliations(affiliationData);
        }
      }

      // Handle subsystem resolution
      if (alterResult?.subsystem || alterResult?.subsystem === 0) {
        await resolveSubsystem(alterResult.subsystem);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alter data');
    } finally {
      setLoading(false);
    }
  };

  return {
    alter,
    user,
    groupObj,
    affiliationGroup,
    affiliationGroupsMap,
    affiliationIdMap,
    subsystemObj,
    loading,
    error,
    refetch,
  };
}
