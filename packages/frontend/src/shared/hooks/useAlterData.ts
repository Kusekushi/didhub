import { useEffect, useState } from 'react';
import { apiClient, type Alter, type Group, type Subsystem } from '@didhub/api-client';

type AlterDetails = Alter & {
  group?: string | number | null;
  affiliations?: unknown;
};

type GroupMap = Record<string, Group>;

type GroupIdMap = Record<number, Group>;

function coerceNumericId(value: unknown): number | null {
  const asString = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!asString) return null;
  const maybeId = Number(asString);
  return Number.isNaN(maybeId) ? null : maybeId;
}

function coerceGroupArray(value: unknown): Group[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is Group => Boolean(candidate && typeof (candidate as Group).name === 'string'));
}

function coerceSubsystemArray(value: unknown): Subsystem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (candidate): candidate is Subsystem => Boolean(candidate && typeof (candidate as Subsystem).name === 'string')
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
      if (groupId !== undefined && groupId !== null && String(groupId).length > 0) {
        try {
          const groupRes = await apiClient.group.get_groups_by_id(groupId);
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
      if (subsystemValue !== undefined && subsystemValue !== null && String(subsystemValue).length > 0) {
        await resolveSubsystem(subsystemValue);
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

        const maybeId = coerceNumericId(raw);
        if (maybeId !== null) {
          try {
            const groupRes = await apiClient.group.get_groups_by_id(maybeId);
            if (groupRes.data) {
              groupsById[maybeId] = groupRes.data;
              continue;
            }
          } catch {
            // fall through to name lookup
          }
        }

        const name = Array.isArray(raw) ? raw.join(',') : String(raw);
        const groupList = await ensureGroupList();
        const found = groupList.find((g) => g && g.name && g.name.toLowerCase() === name.toLowerCase());
        if (found) {
          groupsByName[name] = found;
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
      const rawStr = String(rawSubsystem ?? '').trim();
      if (!rawStr.length) {
        setSubsystemObj(null);
        return;
      }

      const numericId = Number(rawStr);
      if (!Number.isNaN(numericId)) {
        try {
          const subsystemRes = await apiClient.subsystem.get_subsystems_by_id(numericId);
          if (subsystemRes.data) {
            setSubsystemObj(subsystemRes.data);
            return;
          }
        } catch {
          // ignore lookup failure and fall back to name search
        }
      }

      const listRes = await apiClient.subsystem.get_subsystems();
      const subsystems = coerceSubsystemArray(listRes.data?.items);
      const match = subsystems.find(
        (item) => item && item.name && item.name.toLowerCase() === rawStr.toLowerCase(),
      );
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
