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
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const isCollapsed = useCallback((id: number) => collapsed.has(id), [collapsed]);
  return { collapsed, toggle, isCollapsed };
}
