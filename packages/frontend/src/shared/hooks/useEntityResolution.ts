import { useState, useEffect } from 'react';
import { apiClient, type Group, type Subsystem } from '@didhub/api-client';

/**
 * Hook to resolve a group by ID or name
 */
export function useGroupResolution(groupIdOrName: string | number | null | undefined) {
  const [group, setGroup] = useState<Group | null>(null);

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
              const groupData = await apiClient.group.get_groups_by_id(id as any);
              setGroup(groupData.data);
              return;
            } catch {
              // fall through to name lookup
            }
          }
        }

        // Name-based lookup
        const name = String(groupIdOrName);
        const groups = await apiClient.group.get_groups({ query: name, includeMembers: true });
        const found = groups.data.items.find(
          (it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase(),
        );
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
  const [subsystem, setSubsystem] = useState<Subsystem | null>(null);

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
              const subsystemData = await apiClient.subsystem.get_subsystems_by_id(id as any);
              setSubsystem(subsystemData.data);
              return;
            } catch {
              // fall through to name lookup
            }
          }
        }

        // Name-based lookup
        const name = String(subsystemIdOrName);
        const subsystems = await apiClient.subsystem.get_subsystems({ query: name, includeMembers: true });
        const found = subsystems.data.items.find(
          (it) => it && it.name && String(it.name).toLowerCase() === name.toLowerCase(),
        );
        setSubsystem(found || null);
      } catch (e) {
        setSubsystem(null);
      }
    }

    resolveSubsystem();
  }, [subsystemIdOrName]);

  return subsystem;
}
