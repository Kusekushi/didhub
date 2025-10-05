import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FamilyTreeOwner, FamilyTreeResponse, FamilyTreeNodeData } from '../types';
import { ensureHexColor } from '../utils/color';
import { OWNER_PALETTE, generateColorFromIndex } from '../utils/palette';

interface OwnerColorEntry {
  id: number;
  label: string;
  color: string;
  meta?: FamilyTreeOwner;
}

interface OwnerColorsHook {
  ownerColors: Record<number, string>;
  entries: OwnerColorEntry[];
  setOwnerColor: (id: number, color: string) => void;
  clearOwnerColor: (id: number) => void;
}

const STORAGE_KEY = 'familyTree.ownerColors';

const buildOwnerLabel = (owner: FamilyTreeOwner | undefined, id: number): string => {
  if (!owner) return `Owner #${id}`;
  const kind = owner.is_system ? 'System' : 'User';
  return owner.username ? `${kind}: ${owner.username}` : `${kind} #${id}`;
};

export function useOwnerColors(data: FamilyTreeResponse | null): OwnerColorsHook {
  const [overrides, setOverrides] = useState<Record<number, string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      /* ignore */
    }
  }, [overrides]);

  const ownerIds = useMemo(() => {
    if (!data) return [] as number[];
    const ids = new Set<number>();
    (Object.values(data.nodes) as FamilyTreeNodeData[]).forEach((node) => {
      if (node.owner_user_id != null) ids.add(node.owner_user_id);
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [data]);

  const ownerColors = useMemo(() => {
    if (!data) return {} as Record<number, string>;
    const map: Record<number, string> = {};
    ownerIds.forEach((ownerId, index) => {
      const fallback = OWNER_PALETTE[index] || generateColorFromIndex(index + OWNER_PALETTE.length);
      const stored = overrides[ownerId];
      map[ownerId] = ensureHexColor(stored || fallback);
    });
    return map;
  }, [data, ownerIds, overrides]);

  const entries = useMemo<OwnerColorEntry[]>(() => {
    if (!data) return [];
    return ownerIds.map((ownerId, index) => {
      const owner = data.owners ? data.owners[String(ownerId)] : undefined;
      const fallback = OWNER_PALETTE[index] || generateColorFromIndex(index + OWNER_PALETTE.length);
      const color = ensureHexColor(overrides[ownerId] || ownerColors[ownerId] || fallback);
      return {
        id: ownerId,
        label: buildOwnerLabel(owner, ownerId),
        color,
        meta: owner,
      };
    });
  }, [data, ownerColors, overrides, ownerIds]);

  const setOwnerColor = useCallback((id: number, color: string) => {
    setOverrides((prev) => ({ ...prev, [id]: color }));
  }, []);

  const clearOwnerColor = useCallback((id: number) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return {
    ownerColors,
    entries,
    setOwnerColor,
    clearOwnerColor,
  };
}
