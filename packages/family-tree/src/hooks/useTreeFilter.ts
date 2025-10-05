import { useEffect, useMemo, useState } from 'react';
import type { FamilyTreeResponse, FamilyTreeNodeData } from '../types';
import {
  FILTER_STORAGE_KEY,
  LAYER_OPTIONS,
  applyTreeFilter,
  createDefaultTreeFilter,
  formatLayerLimit,
  normalizeTreeFilter,
  parseLayerLimitValue,
  type LayerLimit,
  type TreeFilterState,
} from '../utils/treeFilters';

export interface AlterOption {
  id: number;
  label: string;
  subtitle?: string;
}

export interface TreeFilterHook {
  filter: TreeFilterState;
  effectiveData: FamilyTreeResponse | null;
  filterActive: boolean;
  filterSummary: string | null;
  openDialog: () => void;
  closeDialog: () => void;
  isDialogOpen: boolean;
  draft: TreeFilterState | null;
  alterOptions: AlterOption[];
  updateDraft: (patch: Partial<TreeFilterState>) => void;
  applyDraft: () => void;
  clearFilter: () => void;
  previewCount: number;
  previewData: FamilyTreeResponse | null;
  layerOptions: typeof LAYER_OPTIONS;
  parseLayerLimit: (raw: string) => LayerLimit;
}

export function useTreeFilter(data: FamilyTreeResponse | null): TreeFilterHook {
  const [filter, setFilter] = useState<TreeFilterState>(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TreeFilterState>;
        return normalizeTreeFilter(parsed);
      }
    } catch {
      /* ignore storage errors */
    }
    return createDefaultTreeFilter();
  });
  const [draft, setDraft] = useState<TreeFilterState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter));
    } catch {
      /* ignore */
    }
  }, [filter]);

  const effectiveData = useMemo(() => {
    if (!data) return null;
    const filtered = applyTreeFilter(data, filter);
    return filtered ?? data;
  }, [data, filter]);

  const alterOptions = useMemo<AlterOption[]>(() => {
    if (!data) return [];
    return (Object.values(data.nodes) as FamilyTreeNodeData[])
      .map((node) => {
        const roles = node.system_roles;
        const roleList = Array.isArray(roles) ? roles : roles ? [roles] : [];
        return {
          id: node.id,
          label: node.name || `#${node.id}`,
          subtitle: roleList.length ? roleList.join(', ') : undefined,
        } satisfies AlterOption;
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [data]);

  const filterActive = filter.enabled && filter.alterId != null;

  const selectedAlter = useMemo(() => {
    if (!data || filter.alterId == null) return null;
    return data.nodes[filter.alterId] ?? null;
  }, [data, filter.alterId]);

  const filterSummary = filterActive && selectedAlter
    ? `${selectedAlter.name || `#${selectedAlter.id}`} (↑${formatLayerLimit(filter.layersUp)} ↓${formatLayerLimit(filter.layersDown)} ↔${formatLayerLimit(filter.layersSide)})`
    : null;

  const openDialog = () => {
    setDraft(filter);
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  const updateDraft = (patch: Partial<TreeFilterState>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const applyDraft = () => {
    if (!draft) {
      setDialogOpen(false);
      return;
    }
    const next = normalizeTreeFilter(draft);
    const enforced = next.alterId == null ? { ...next, enabled: false } : next;
    setFilter(enforced);
    setDialogOpen(false);
  };

  const clearFilter = () => {
    setFilter(createDefaultTreeFilter());
    setDialogOpen(false);
  };

  const previewData = useMemo(() => {
    if (!data || !draft) return null;
    const normalized = normalizeTreeFilter(draft);
    if (!normalized.enabled || normalized.alterId == null) return null;
    return applyTreeFilter(data, normalized);
  }, [data, draft]);

  const previewCount = previewData ? Object.keys(previewData.nodes).length : 0;

  return {
    filter,
    effectiveData,
    filterActive,
    filterSummary,
    openDialog,
    closeDialog,
    isDialogOpen: dialogOpen,
    draft,
    alterOptions,
    updateDraft,
    applyDraft,
    clearFilter,
    previewCount,
    previewData,
    layerOptions: LAYER_OPTIONS,
    parseLayerLimit: parseLayerLimitValue,
  };
}
