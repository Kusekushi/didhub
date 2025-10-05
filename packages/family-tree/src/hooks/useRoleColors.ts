import { useMemo } from 'react';
import type { FamilyTreeResponse, FamilyTreeNodeData } from '../types';
import { ensureHexColor } from '../utils/color';
import { ROLE_PALETTE, generateColorFromIndex } from '../utils/palette';

export function useRoleColors(data: FamilyTreeResponse | null): Record<string, string> {
  return useMemo(() => {
    if (!data) return {};
    const roles: string[] = [];
    (Object.values(data.nodes) as FamilyTreeNodeData[]).forEach((node) => {
      const raw = node.system_roles;
      const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
      items.forEach((role) => {
        if (role && !roles.includes(role)) roles.push(role);
      });
    });
    if (!roles.includes('Unassigned')) roles.push('Unassigned');
    const map: Record<string, string> = {};
    roles.forEach((role, index) => {
      const baseColor = ROLE_PALETTE[index] ?? generateColorFromIndex(index);
      map[role] = ensureHexColor(baseColor);
    });
    map['Unassigned'] = ensureHexColor(map['Unassigned'] || '#5a5a5a');
    return map;
  }, [data]);
}
