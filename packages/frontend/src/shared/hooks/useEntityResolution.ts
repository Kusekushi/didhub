import { useState, useEffect } from 'react';
import { getGroupById, listGroups } from '../../services/groupService';
import { getSubsystemById, listSubsystems } from '../../services/subsystemService';

/**
 * Hook to resolve a group by ID or name
 */
export function useGroupResolution(groupIdOrName: string | number | null | undefined) {
  // Adapter returns the API shape; keep local typing loose to avoid coupling to generated client types
  const [group, setGroup] = useState<any | null>(null);

  useEffect(() => {
    if (groupIdOrName == null) {
      setGroup(null);
      return;
    }

    async function resolveGroup() {
      try {
        // Try direct id lookup (treat as string id)
        if (typeof groupIdOrName === 'string') {
          const id = groupIdOrName.trim().replace(/^#/u, '');
          if (id) {
            try {
              const groupData = await getGroupById(id as any);
              setGroup(groupData ?? null);
              return;
            } catch {
              // fall through to name lookup
            }
          }
        }

        // Name-based lookup
        const name = String(groupIdOrName);
        const groups: any = (await listGroups({ q: name })) ?? { items: [] };
        const found = (groups.items || []).find((it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase());
        setGroup(found || null);
      } catch (e) {
        setGroup(null);
      }
    }

    resolveGroup();
  }, [groupIdOrName]);

  return group;
}

/**
 * Hook to resolve a subsystem by ID or name
 */
export function useSubsystemResolution(subsystemIdOrName: string | number | null | undefined) {
  const [subsystem, setSubsystem] = useState<any | null>(null);

  useEffect(() => {
    if (subsystemIdOrName == null) {
      setSubsystem(null);
      return;
    }

    async function resolveSubsystem() {
      try {
        // Try direct id lookup (treat as string id)
        if (typeof subsystemIdOrName === 'string') {
          const id = subsystemIdOrName.trim().replace(/^#/u, '');
          if (id) {
            try {
              const subsystemData = await getSubsystemById(id as any);
              setSubsystem(subsystemData ?? null);
              return;
            } catch {
              // fall through to name lookup
            }
          }
        }

        // Name-based lookup
        const name = String(subsystemIdOrName);
        const subsystems: any = (await listSubsystems({ q: name })) ?? { items: [] };
        const found = (subsystems.items || []).find((it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase());
        setSubsystem(found || null);
      } catch (e) {
        setSubsystem(null);
      }
    }

    resolveSubsystem();
  }, [subsystemIdOrName]);

  return subsystem;
}
