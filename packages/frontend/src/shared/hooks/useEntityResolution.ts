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
        // Try numeric ID first
        if (typeof groupIdOrName === 'number' || (typeof groupIdOrName === 'string' && !isNaN(Number(groupIdOrName)))) {
          const id = typeof groupIdOrName === 'number' ? groupIdOrName : Number(groupIdOrName);
          const groupData = await apiClient.group.get_groups_by_id(id);
          setGroup(groupData.data);
          return;
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
        // Try numeric ID first
        if (typeof subsystemIdOrName === 'number' || (typeof subsystemIdOrName === 'string' && !isNaN(Number(subsystemIdOrName)))) {
          const id = typeof subsystemIdOrName === 'number' ? subsystemIdOrName : Number(subsystemIdOrName);
          const subsystemData = await apiClient.subsystem.get_subsystems_by_id(id);
          setSubsystem(subsystemData.data);
          return;
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
