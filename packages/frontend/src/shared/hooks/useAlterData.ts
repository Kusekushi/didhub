import { useEffect, useState } from 'react';
import * as alterService from '../../services/alterService';
import * as groupService from '../../services/groupService';
import * as subsystemService from '../../services/subsystemService';
import { normalizeEntityId } from '../utils/alterFormUtils';

type AlterDetails = any & {
  // optional helper fields used by the frontend
  group?: string | null;
  affiliations?: unknown;
  subsystem?: unknown;
};

type GroupMap = Record<string, any>;

type GroupIdMap = Record<string, any>;

function coerceStringId(value: unknown): string | null {
  // Accept strings or objects with `id` and normalize to UUID-like id strings
  return normalizeEntityId(value);
}

function coerceGroupArray(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is any => Boolean(candidate && typeof (candidate as any).name === 'string'));
}

function coerceSubsystemArray(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is any => Boolean(candidate && typeof (candidate as any).name === 'string'));
}

export function useAlterData(id?: string) {
  const [alter, setAlter] = useState<AlterDetails | null>(null);
  const [groupObj, setGroupObj] = useState<any | null>(null);
  const [affiliationGroup, setAffiliationGroup] = useState<any | null>(null);
  const [affiliationGroupsMap, setAffiliationGroupsMap] = useState<GroupMap>({});
  const [affiliationIdMap, setAffiliationIdMap] = useState<GroupIdMap>({});
  const [subsystemObj, setSubsystemObj] = useState<any | null>(null);
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

  const alterData = (await alterService.getAlterById(targetId as any)) as AlterDetails | null;
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
          const group = await groupService.getGroupById(normalizedGroupId as any);
          setGroupObj(group ?? null);
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
  let cachedGroupList: any[] | null = null;

      const ensureGroupList = async () => {
        if (cachedGroupList) return cachedGroupList;
        try {
          const res = await groupService.listGroups({});
          cachedGroupList = coerceGroupArray(res?.items ?? []);
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
              const group = await groupService.getGroupById(maybeId as any);
            if (group) {
              groupsById[maybeId] = group;
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
          const subsystem = await subsystemService.getSubsystemById(normalized as any);
          if (subsystem) {
            setSubsystemObj(subsystem);
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

  const listRes = await subsystemService.listSubsystems({});
    const subsystems = coerceSubsystemArray(listRes?.items ?? []);
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
