import { useState, useCallback } from 'react';

interface FamilyTreeResponse {
  roots: any[];
  nodes: Record<string, any>;
  owners?: Record<string, any>;
  edges: { parent: [number, number][]; partner: [number, number][] };
}

export function useExpandState(data: FamilyTreeResponse | null) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const isCollapsed = useCallback((id: number) => collapsed.has(id), [collapsed]);
  return { collapsed, toggle, isCollapsed };
}
