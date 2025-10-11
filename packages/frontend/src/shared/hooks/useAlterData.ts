import { useEffect, useState } from 'react';
import { apiClient, type Alter, type Group, type Subsystem } from '@didhub/api-client';
import { normalizeEntityId } from '../utils/alterFormUtils';

type AlterDetails = Alter & {
  // entity IDs are UUID strings only (no numeric ids)
  group?: string | null;
  affiliations?: unknown;
};

type GroupMap = Record<string, Group>;

type GroupIdMap = Record<string, Group>;

function coerceStringId(value: unknown): string | null {
  // Accept strings or objects with `id` and normalize to UUID-like id strings
  return normalizeEntityId(value);
}

function coerceGroupArray(value: unknown): Group[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Group =>
    Boolean(candidate && typeof (candidate as Group).name === 'string'),
  );
}

function coerceSubsystemArray(value: unknown): Subsystem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Subsystem =>
    Boolean(candidate && typeof (candidate as Subsystem).name === 'string'),
  );
}

export function useAlterData(id?: string) {
  const [alter, setAlter] = useState<AlterDetails | null>(null);
  const [groupObj, setGroupObj] = useState<Group | null>(null);
  const [affiliationGroup, setAffiliationGroup] = useState<Group | null>(null);
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<GroupMap>({});
  const [affiliationIdMap, setAffiliationIdMap] = useState<GroupIdMap>({});
  const [subsystemObj, setSubsystemObj] = useState<Subsystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setAlter(null);
      setGroupObj(null);
      setAffiliationGroup(null);
      setAffiliationGroupsMap({});
      setAffiliationIdMap({});
      setSubsystemObj(null);
      setLoading(false);
      return;
    }

    void loadAlter(id);
  }, [id]);

  const loadAlter = async (targetId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.alter.get_alters_by_id(targetId);
      const alterData = (response.data ?? null) as AlterDetails | null;
      setAlter(alterData);

      if (!alterData) {
        setGroupObj(null);
        setAffiliationGroup(null);
        setAffiliationGroupsMap({});
        setAffiliationIdMap({});
        setSubsystemObj(null);
        return;
      }

      const groupId = alterData.group;
      const normalizedGroupId = normalizeEntityId(groupId);
      if (normalizedGroupId) {
        try {
          const groupRes = await apiClient.group.get_groups_by_id(normalizedGroupId);
          setGroupObj(groupRes.data ?? null);
        } catch {
          setGroupObj(null);
        }
        setAffiliationGroup(null);
        setAffiliationGroupsMap({});
        setAffiliationIdMap({});
      } else {
        setGroupObj(null);
        setAffiliationGroup(null);
        const affiliations = alterData.affiliations;
        if (affiliations !== undefined && affiliations !== null) {
          await resolveAffiliations(affiliations);
        } else {
          setAffiliationGroupsMap({});
          setAffiliationIdMap({});
        }
      }

      const subsystemValue = alterData.subsystem;
      const normalizedSubsystem = normalizeEntityId(subsystemValue);
      if (normalizedSubsystem) {
        await resolveSubsystem(normalizedSubsystem);
      } else {
        setSubsystemObj(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alter data');
    } finally {
      setLoading(false);
    }
  };

  const resolveAffiliations = async (affiliationData: unknown) => {
    try {
      const entries = Array.isArray(affiliationData) ? affiliationData : [affiliationData];
      const groupsByName: GroupMap = {};
      const groupsById: GroupIdMap = {};
      let cachedGroupList: Group[] | null = null;

      const ensureGroupList = async () => {
        if (cachedGroupList) return cachedGroupList;
        try {
          const res = await apiClient.group.get_groups();
          cachedGroupList = coerceGroupArray(res.data?.items);
        } catch {
          cachedGroupList = [];
        }
        return cachedGroupList;
      };

      for (const raw of entries) {
        if (raw === undefined || raw === null) continue;

        const maybeId = coerceStringId(raw);
        if (maybeId !== null) {
          try {
            const groupRes = await apiClient.group.get_groups_by_id(maybeId as any);
            if (groupRes.data) {
              groupsById[maybeId] = groupRes.data;
              continue;
            }
          } catch {
            // fall through to name lookup
          }
        }

        // If we didn't resolve an ID, try name lookup only when we actually have a string name.
        let name: string | null = null;
        if (Array.isArray(raw)) {
          name = raw.join(',');
        } else if (typeof raw === 'string') {
          name = raw.trim();
        }
        if (name) {
          const groupList = await ensureGroupList();
          const found = groupList.find((g) => g && g.name && g.name.toLowerCase() === name!.toLowerCase());
          if (found) {
            groupsByName[name] = found;
          }
        }
      }

      setAffiliationGroupsMap(groupsByName);
      setAffiliationIdMap(groupsById);
    } catch {
      setAffiliationGroupsMap({});
      setAffiliationIdMap({});
    }
  };

  const resolveSubsystem = async (rawSubsystem: unknown) => {
    try {
      const normalized = normalizeEntityId(rawSubsystem);
      if (normalized) {
        try {
          const subsystemRes = await apiClient.subsystem.get_subsystems_by_id(normalized as any);
          if (subsystemRes.data) {
            setSubsystemObj(subsystemRes.data);
            return;
          }
        } catch {
          // ignore lookup failure and fall back to name search
        }
      }

      const rawStr = String(rawSubsystem ?? '').trim();
      if (!rawStr.length) {
        setSubsystemObj(null);
        return;
      }

      const listRes = await apiClient.subsystem.get_subsystems();
      const subsystems = coerceSubsystemArray(listRes.data?.items);
      const match = subsystems.find((item) => item && item.name && item.name.toLowerCase() === rawStr.toLowerCase());
      setSubsystemObj(match ?? null);
    } catch {
      setSubsystemObj(null);
    }
  };

  const refetch = async () => {
    if (!id) return;
    await loadAlter(id);
  };

  return {
    alter,
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
