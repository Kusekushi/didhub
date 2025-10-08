import { useState, useEffect } from 'react';
import { apiClient, type Alter, type Group, type User, type Subsystem } from '@didhub/api-client';

/**
 * Hook to manage alter data and related entities (group, subsystem, affiliations)
 */
export function useAlterData(id?: string) {
  const [alter, setAlter] = useState<Alter | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [groupObj, setGroupObj] = useState<Group | null>(null);
  const [affiliationGroup, setAffiliationGroup] = useState<Group | null>(null);
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<Record<string, Group>>({});
  const [affiliationIdMap, setAffiliationIdMap] = useState<Record<number, Group>>({});
  const [subsystemObj, setSubsystemObj] = useState<Subsystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [alterResult, userResult] = await Promise.all([
          apiClient.alters.get(id),
          apiClient.users.sessionIfAuthenticated(),
        ]);

        setAlter(alterResult);
        setUser(userResult);

        // Handle group resolution
        if (alterResult?.group !== undefined && alterResult?.group !== null) {
          try {
            const group = await apiClient.groups.get(alterResult.group as string | number);
            setGroupObj(group);
          } catch (e) {
            setGroupObj(null);
          }
          setAffiliationGroup(null);
        } else {
          setGroupObj(null);
          setAffiliationGroup(null);
          // Handle affiliations
          const affiliationData = alterResult?.affiliations;
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
      const idMap: Record<number, Group> = {};

      for (const rawName of affiliations) {
        // Try numeric ID first
        if (typeof rawName === 'number' || typeof rawName === 'string') {
          const trimmed = typeof rawName === 'string' ? rawName.trim() : String(rawName);
          if (trimmed.length > 0) {
            const maybeId = Number(trimmed);
            if (!Number.isNaN(maybeId)) {
              try {
                const group = await apiClient.groups.get(maybeId);
                if (group) {
                  idMap[maybeId] = group;
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
          const groups = await apiClient.groups.list({ query: name || '', includeMembers: true });
          const found = (groups as Group[]).find(
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

  async function resolveSubsystem(rawSubsystem: any) {
    try {
      const rawStr = String(rawSubsystem);
      const maybeId = typeof rawSubsystem === 'number' ? rawSubsystem : Number(rawStr);

      if (!Number.isNaN(maybeId) && rawStr.trim() !== '') {
        try {
          const subsystem = await apiClient.subsystems.get(maybeId);
          if (subsystem) {
            setSubsystemObj(subsystem);
            return;
          }
        } catch (e) {
          // Fall through to name lookup
        }
      }

      // Name lookup fallback
      const subsystems = await apiClient.subsystems.list({ query: rawStr || '', includeMembers: true });
      const found = subsystems.find((it) => it && it.name && String(it.name).toLowerCase() === rawStr.toLowerCase());
      if (found) setSubsystemObj(found);
    } catch (e) {
      setSubsystemObj(null);
    }
  }

  const refetch = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const [alterResult, userResult] = await Promise.all([
        apiClient.alters.get(id),
        apiClient.users.sessionIfAuthenticated(),
      ]);

      setAlter(alterResult);
      setUser(userResult);

      // Handle group resolution
      if (alterResult?.group !== undefined && alterResult?.group !== null) {
        try {
          const group = await apiClient.groups.get(alterResult.group as string | number);
          setGroupObj(group);
        } catch (e) {
          setGroupObj(null);
        }
        setAffiliationGroup(null);
      } else {
        setGroupObj(null);
        setAffiliationGroup(null);
        // Handle affiliations
        const affiliationData = alterResult?.affiliations;
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
