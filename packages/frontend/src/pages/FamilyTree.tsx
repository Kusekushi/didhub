import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import SettingsIcon from '@mui/icons-material/Settings';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import * as d3 from 'd3';
import { apiClient } from '@didhub/api-client';
import type { FamilyTreeNodeData, FamilyTreeOwner, FamilyTreeResponse, NestedFamilyTreeNode } from '@didhub/api-client';
import FamilyTreeGraph, {
  DEFAULT_GRAPH_THEME,
  EDGE_KINDS,
  type EdgeAppearance,
  type EdgeKind,
  type GraphTheme,
} from '../components/FamilyTreeGraph';
import NodeView from '../components/NodeView';
import { useExpandState } from '../hooks/useExpandState';
import { ensureHexColor, getReadableTextColor } from '../utils/color';
import { useAuth } from '../contexts/AuthContext';

const ROLE_PALETTE = ['#8E44AD', '#1976D2', '#00897B', '#F4511E', '#6D4C41', '#039BE5', '#FBC02D', '#5E35B1', '#43A047', '#00838F', '#EF6C00', '#7E57C2'] as const;
const OWNER_PALETTE = ['#EF5350', '#29B6F6', '#AB47BC', '#26A69A', '#FFA726', '#7E57C2', '#66BB6A', '#FF7043'] as const;
const FALLBACK_ROLE_PALETTE = ['#90CAF9', '#F48FB1', '#CE93D8', '#FFCC80', '#A5D6A7', '#FFAB91', '#9FA8DA', '#80CBC4', '#B39DDB', '#F06292', '#AED581', '#4FC3F7'] as const;

function generateColorFromIndex(index: number): string {
  const stops = 24;
  if (typeof d3.interpolateRainbow === 'function') {
    const color = d3.color(d3.interpolateRainbow((index % stops) / stops));
    if (color) return ensureHexColor(color.formatHex());
  }
  return ensureHexColor(FALLBACK_ROLE_PALETTE[index % FALLBACK_ROLE_PALETTE.length]);
}

type LayoutModeSetting = 'hierarchy' | 'group';
type ColorModeSetting = 'role' | 'owner';
type LineThemeKey = 'default' | 'contrast' | 'minimal' | 'custom';
type LayerLimit = number | 'all';

interface FamilyTreeSettings {
  layoutMode: LayoutModeSetting;
  colorMode: ColorModeSetting;
  excludeIsolated: boolean;
  lineTheme: LineThemeKey;
  graphTheme: GraphTheme;
}

interface TreeFilterState {
  enabled: boolean;
  alterId: number | null;
  layersUp: LayerLimit;
  layersDown: LayerLimit;
  layersSide: LayerLimit;
}

interface AlterOption {
  id: number;
  label: string;
  subtitle?: string;
}

const SETTINGS_STORAGE_KEY = 'familyTree.settings.v1';

const EDGE_LABELS: Record<EdgeKind, string> = {
  parent: 'Parent ↔ Child',
  partner: 'Partnered alters',
  'user-partner': 'Alter ↔ User (partner)',
  'user-parent': 'User → Alter (parent)',
  'user-child': 'Alter → User (child)',
};

const LAYER_OPTIONS: Array<{ value: LayerLimit; label: string }> = [
  { value: 0, label: '0 layers' },
  { value: 1, label: '1 layer' },
  { value: 2, label: '2 layers' },
  { value: 3, label: '3 layers' },
  { value: 4, label: '4 layers' },
  { value: 5, label: '5 layers' },
  { value: 'all', label: 'Full depth' },
];

const FILTER_STORAGE_KEY = 'familyTree.filter.v1';

const isValidLayerLimit = (value: LayerLimit | null | undefined): value is LayerLimit =>
  value === 'all' ||
  (typeof value === 'number' &&
    LAYER_OPTIONS.some((option) => typeof option.value === 'number' && option.value === value));

const normalizeLayerLimit = (value: LayerLimit | null | undefined, fallback: LayerLimit): LayerLimit =>
  isValidLayerLimit(value) ? value : fallback;

const parseLayerLimitValue = (raw: string): LayerLimit => {
  if (raw === 'all') return 'all';
  const numeric = Number(raw);
  if (Number.isNaN(numeric)) return 0;
  return normalizeLayerLimit(numeric as LayerLimit, 0);
};

const createDefaultTreeFilter = (): TreeFilterState => ({
  enabled: false,
  alterId: null,
  layersUp: 2,
  layersDown: 2,
  layersSide: 1,
});

const normalizeTreeFilter = (value?: Partial<TreeFilterState>): TreeFilterState => {
  const base = createDefaultTreeFilter();
  if (!value) return base;
  return {
    enabled: value.enabled ?? base.enabled,
    alterId: typeof value.alterId === 'number' ? value.alterId : base.alterId,
    layersUp: normalizeLayerLimit(value.layersUp as LayerLimit, base.layersUp),
    layersDown: normalizeLayerLimit(value.layersDown as LayerLimit, base.layersDown),
    layersSide: normalizeLayerLimit(value.layersSide as LayerLimit, base.layersSide),
  };
};

type FilterEdgeType = 'up' | 'down' | 'side';

interface TraversalBudget {
  up: number;
  down: number;
  side: number;
}

interface QueueEntry extends TraversalBudget {
  id: number;
}

interface AdjacentEdge {
  target: number;
  type: FilterEdgeType;
}

const decrementBudget = (value: number): number =>
  value === Number.POSITIVE_INFINITY ? value : Math.max(0, value - 1);

const shouldVisitNode = (next: TraversalBudget, previous?: TraversalBudget): boolean => {
  if (!previous) return true;
  return next.up > previous.up || next.down > previous.down || next.side > previous.side;
};

const buildAdjacencyMap = (data: FamilyTreeResponse): Map<number, AdjacentEdge[]> => {
  const adjacency = new Map<number, AdjacentEdge[]>();
  const addEdge = (from: number, to: number, type: FilterEdgeType) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ target: to, type });
  };

  Object.values(data.nodes).forEach((node) => {
    node.parents.forEach((parentId) => {
      addEdge(node.id, parentId, 'up');
      addEdge(parentId, node.id, 'down');
    });
    node.children.forEach((childId) => {
      addEdge(node.id, childId, 'down');
      addEdge(childId, node.id, 'up');
    });
    node.partners.forEach((partnerId) => {
      addEdge(node.id, partnerId, 'side');
      addEdge(partnerId, node.id, 'side');
    });

    (node.user_parents ?? []).forEach((userId) => {
      addEdge(node.id, userId, 'up');
      addEdge(userId, node.id, 'down');
    });
    (node.user_children ?? []).forEach((userId) => {
      addEdge(node.id, userId, 'down');
      addEdge(userId, node.id, 'up');
    });
    (node.user_partners ?? []).forEach((userId) => {
      addEdge(node.id, userId, 'side');
      addEdge(userId, node.id, 'side');
    });
  });

  return adjacency;
};

const filterNestedRoots = (roots: NestedFamilyTreeNode[], allowed: Set<number>): NestedFamilyTreeNode[] => {
  const filterList = (values?: number[]) => (values ? values.filter((id) => allowed.has(id)) : []);
  const visit = (node: NestedFamilyTreeNode): NestedFamilyTreeNode[] => {
    const childNodes = node.children.flatMap(visit);
    if (!allowed.has(node.id)) {
      return childNodes;
    }
    return [
      {
        ...node,
        children: childNodes,
        partners: filterList(node.partners),
        parents: filterList(node.parents),
        affiliations: filterList(node.affiliations),
      },
    ];
  };
  return roots.flatMap(visit);
};

const applyTreeFilter = (data: FamilyTreeResponse, filter: TreeFilterState): FamilyTreeResponse | null => {
  if (!filter.enabled || filter.alterId == null) return null;
  const rootNode = data.nodes[filter.alterId];
  if (!rootNode) return null;

  const adjacency = buildAdjacencyMap(data);
  const allowedAlterIds = new Set<number>([filter.alterId]);
  const allowedUserIds = new Set<number>();

  const initialBudget: TraversalBudget = {
    up: coerceLimit(filter.layersUp),
    down: coerceLimit(filter.layersDown),
    side: coerceLimit(filter.layersSide),
  };

  const queue: QueueEntry[] = [{ id: filter.alterId, ...initialBudget }];
  const bestBudget = new Map<number, TraversalBudget>([[filter.alterId, initialBudget]]);

  while (queue.length) {
    const { id, up, down, side } = queue.shift()!;
    const neighbors = adjacency.get(id);
    if (!neighbors) continue;

    neighbors.forEach(({ target, type }) => {
      let nextBudget: TraversalBudget = { up, down, side };
      switch (type) {
        case 'up':
          if (up <= 0) return;
          nextBudget = { up: decrementBudget(up), down, side };
          break;
        case 'down':
          if (down <= 0) return;
          nextBudget = { up, down: decrementBudget(down), side };
          break;
        case 'side':
          if (side <= 0) return;
          nextBudget = { up, down, side: decrementBudget(side) };
          break;
        default:
          return;
      }

      const previous = bestBudget.get(target);
      if (previous && !shouldVisitNode(nextBudget, previous)) return;

      bestBudget.set(target, nextBudget);
      if (data.nodes[target]) {
        allowedAlterIds.add(target);
      } else {
        allowedUserIds.add(target);
      }
      queue.push({ id: target, ...nextBudget });
    });
  }

  const filteredNodes: Record<string, FamilyTreeNodeData> = {};
  allowedAlterIds.forEach((id) => {
    const original = data.nodes[id];
    if (!original) return;
    filteredNodes[id] = {
      ...original,
      parents: original.parents.filter((pid) => allowedAlterIds.has(pid)),
      children: original.children.filter((cid) => allowedAlterIds.has(cid)),
      partners: original.partners.filter((pid) => allowedAlterIds.has(pid)),
      user_parents: (original.user_parents ?? []).filter((uid) => allowedUserIds.has(uid)),
      user_children: (original.user_children ?? []).filter((uid) => allowedUserIds.has(uid)),
      user_partners: (original.user_partners ?? []).filter((uid) => allowedUserIds.has(uid)),
    };
  });

  const filteredEdges = {
    parent: data.edges.parent.filter(([a, b]) => allowedAlterIds.has(a) && allowedAlterIds.has(b)),
    partner: data.edges.partner.filter(([a, b]) => allowedAlterIds.has(a) && allowedAlterIds.has(b)),
  };

  let filteredOwners: Record<string, FamilyTreeOwner> | undefined;
  if (data.owners) {
    const entries = Object.entries(data.owners).filter(([key]) => allowedUserIds.has(Number(key)));
    if (entries.length) {
      filteredOwners = Object.fromEntries(entries);
    }
  }

  let filteredRoots = filterNestedRoots(data.roots, allowedAlterIds);
  if (filteredRoots.length === 0) {
    filteredRoots = filterNestedRoots(
      [
        {
          id: rootNode.id,
          name: rootNode.name || `#${rootNode.id}`,
          partners: rootNode.partners,
          parents: rootNode.parents,
          children: [],
          affiliations: [],
          duplicated: false,
        } as NestedFamilyTreeNode,
      ],
      allowedAlterIds,
    );
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    roots: filteredRoots.length ? filteredRoots : data.roots,
    owners: filteredOwners,
  };
};

const DASH_OPTIONS = [
  { value: 'solid', label: 'Solid', dash: null as string | null },
  { value: 'dashed', label: 'Dashed', dash: '8 4' },
  { value: 'dotted', label: 'Dotted', dash: '2 6' },
];

const sanitizeBackgroundColor = (value: string): string => ensureHexColor(value, DEFAULT_GRAPH_THEME.backgroundColor);

const formatLayerLimit = (limit: LayerLimit): string => (limit === 'all' ? '∞' : String(limit));

const coerceLimit = (limit: LayerLimit): number => (limit === 'all' ? Number.POSITIVE_INFINITY : limit);

const cloneTheme = (theme: GraphTheme): GraphTheme => ({
  backgroundColor: sanitizeBackgroundColor(theme.backgroundColor),
  node: { ...theme.node },
  edges: EDGE_KINDS.reduce((acc, key) => {
    const source = theme.edges[key];
    acc[key] = { ...source } as EdgeAppearance;
    return acc;
  }, {} as Record<EdgeKind, EdgeAppearance>),
});

const mergeThemes = (base: GraphTheme, incoming: GraphTheme): GraphTheme => {
  const theme = cloneTheme(base);
  if (incoming.backgroundColor) theme.backgroundColor = sanitizeBackgroundColor(incoming.backgroundColor);
  theme.node = {
    userBorder: incoming.node?.userBorder ?? theme.node.userBorder,
    alterBorder: incoming.node?.alterBorder ?? theme.node.alterBorder,
    highlightBorder: incoming.node?.highlightBorder ?? theme.node.highlightBorder,
  };

  EDGE_KINDS.forEach((kind) => {
    const incomingEdge = incoming.edges?.[kind];
    if (!incomingEdge) return;
    theme.edges[kind] = {
      ...theme.edges[kind],
      ...incomingEdge,
    };
  });

  return theme;
};

const createDefaultSettings = (): FamilyTreeSettings => ({
  layoutMode: 'hierarchy',
  colorMode: 'role',
  excludeIsolated: false,
  lineTheme: 'default',
  graphTheme: cloneTheme(DEFAULT_GRAPH_THEME),
});

const normalizeSettings = (value?: Partial<FamilyTreeSettings>): FamilyTreeSettings => {
  const base = createDefaultSettings();
  if (!value) return base;
  return {
    layoutMode: value.layoutMode ?? base.layoutMode,
    colorMode: value.colorMode ?? base.colorMode,
    excludeIsolated: value.excludeIsolated ?? base.excludeIsolated,
    lineTheme: value.lineTheme ?? (value.graphTheme ? 'custom' : base.lineTheme),
    graphTheme: value.graphTheme ? mergeThemes(base.graphTheme, value.graphTheme) : base.graphTheme,
  };
};

const LINE_THEME_PRESETS: Record<Exclude<LineThemeKey, 'custom'>, { label: string; description: string; create: () => GraphTheme }> = {
  default: {
    label: 'Default',
    description: 'Original DIDHub family tree styling.',
    create: () => cloneTheme(DEFAULT_GRAPH_THEME),
  },
  contrast: {
    label: 'High contrast',
    description: 'Bold neon lines with higher visibility.',
    create: () => {
      const theme = cloneTheme(DEFAULT_GRAPH_THEME);
      theme.backgroundColor = '#101728';
      theme.node.alterBorder = '#ff7043';
      theme.node.userBorder = '#ffd54f';
      theme.node.highlightBorder = '#ffffff';
      theme.edges.parent = { color: '#ff7043', width: 2.6, dash: null, opacity: 0.92 };
      theme.edges.partner = { color: '#ffca28', width: 2.3, dash: '6 4', opacity: 0.82 };
      theme.edges['user-partner'] = { color: '#26c6da', width: 2.1, dash: '2 6', opacity: 0.78 };
      theme.edges['user-parent'] = { color: '#ab47bc', width: 2.15, dash: '4 6', opacity: 0.78 };
      theme.edges['user-child'] = { color: '#66bb6a', width: 2.15, dash: '4 6', opacity: 0.78 };
      return theme;
    },
  },
  minimal: {
    label: 'Minimal',
    description: 'Subtle desaturated lines for dense graphs.',
    create: () => {
      const theme = cloneTheme(DEFAULT_GRAPH_THEME);
      theme.backgroundColor = '#1b1f2a';
      theme.node.alterBorder = '#546e7a';
      theme.node.userBorder = '#90a4ae';
      theme.node.highlightBorder = '#fafafa';
      EDGE_KINDS.forEach((kind) => {
        const width = kind === 'parent' ? 1.8 : 1.5;
        const dash = kind === 'parent' ? null : '3 6';
        const opacity = kind === 'parent' ? 0.7 : 0.55;
        theme.edges[kind] = { color: '#8a93a2', width, dash, opacity };
      });
      return theme;
    },
  },
};

export default function FamilyTree() {
  const [data, setData] = useState<FamilyTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [treeFilter, setTreeFilter] = useState<TreeFilterState>(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TreeFilterState>;
        return normalizeTreeFilter(parsed);
      }
    } catch {
      // ignore storage parse errors
    }
    return createDefaultTreeFilter();
  });
  const [filterDraft, setFilterDraft] = useState<TreeFilterState | null>(null);
  const [settings, setSettings] = useState<FamilyTreeSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FamilyTreeSettings>;
        return normalizeSettings(parsed);
      }
    } catch {
      // ignore
    }

    let fallbackColorMode: FamilyTreeSettings['colorMode'] = 'role';
    try {
      const legacy = localStorage.getItem('familyTree.colorMode');
      if (legacy === 'owner') fallbackColorMode = 'owner';
    } catch {
      // ignore legacy read errors
    }

    const defaults = createDefaultSettings();
    defaults.colorMode = fallbackColorMode;
    return defaults;
  });
  const [search, setSearch] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const effectiveData = useMemo(() => {
    if (!data) return null;
    const filtered = applyTreeFilter(data, treeFilter);
    return filtered ?? data;
  }, [data, treeFilter]);
  const { toggle, isCollapsed } = useExpandState(effectiveData);
  const layoutMode = settings.layoutMode;
  const colorMode = settings.colorMode;
  const graphTheme = settings.graphTheme;
  const excludeIsolated = settings.excludeIsolated;
  const handleSettingsClose = () => setSettingsOpen(false);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors (e.g., Safari private mode)
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(treeFilter));
    } catch {
      // ignore
    }
  }, [treeFilter]);

  const updateSettings = (patch: Partial<FamilyTreeSettings>) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...patch }));
  };

  const updateGraphTheme = (mutator: (theme: GraphTheme) => void, markCustom = true) => {
    setSettings((prev) => {
      const nextTheme = cloneTheme(prev.graphTheme);
      mutator(nextTheme);
      return {
        ...prev,
        lineTheme: markCustom ? 'custom' : prev.lineTheme,
        graphTheme: nextTheme,
      };
    });
  };

  const applyLineThemePreset = (key: Exclude<LineThemeKey, 'custom'>) => {
    const preset = LINE_THEME_PRESETS[key];
    setSettings((prev) => ({
      ...prev,
      lineTheme: key,
      graphTheme: preset.create(),
    }));
  };

  const handleLineThemeSelect = (event: SelectChangeEvent<LineThemeKey>) => {
    const value = event.target.value as LineThemeKey;
    if (value === 'custom') {
      setSettings((prev) => ({ ...prev, lineTheme: 'custom' }));
      return;
    }
    applyLineThemePreset(value as Exclude<LineThemeKey, 'custom'>);
  };

  const handleResetTheme = () => {
    setSettings((prev) => ({
      ...prev,
      lineTheme: 'default',
      graphTheme: cloneTheme(DEFAULT_GRAPH_THEME),
    }));
  };

  const handleBackgroundColorChange = (color: string) => {
    updateGraphTheme((theme) => {
      theme.backgroundColor = sanitizeBackgroundColor(color);
    });
  };

  const handleNodeBorderChange = (key: keyof GraphTheme['node'], color: string) => {
    updateGraphTheme((theme) => {
      theme.node[key] = ensureHexColor(color);
    });
  };

  const handleEdgeColorChange = (kind: EdgeKind, color: string) => {
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        color: ensureHexColor(color),
      };
    });
  };

  const handleEdgeWidthChange = (kind: EdgeKind, width: number) => {
    const clamped = Math.min(Math.max(Number.isFinite(width) ? width : 0, 0.5), 6);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        width: clamped,
      };
    });
  };

  const handleEdgeDashChange = (kind: EdgeKind, dashValue: string) => {
    const option = DASH_OPTIONS.find((opt) => opt.value === dashValue);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        dash: option?.dash ?? null,
      };
    });
  };

  const handleEdgeOpacityChange = (kind: EdgeKind, opacity: number) => {
    const clamped = Math.min(Math.max(opacity, 0.1), 1);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        opacity: clamped,
      };
    });
  };

  const activeLineThemeDescription =
    settings.lineTheme !== 'custom'
      ? LINE_THEME_PRESETS[settings.lineTheme as Exclude<LineThemeKey, 'custom'>].description
      : 'Custom theme, tailored using the controls below.';

  // Build role color mapping
  const roleColors = useMemo(() => {
    if (!effectiveData) return {} as Record<string, string>;
    const roles: string[] = [];
    Object.values(effectiveData.nodes).forEach((n) => {
      const raw = n.system_roles;
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      arr.forEach((role) => {
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
  }, [effectiveData]);

  const [customOwnerColors, setCustomOwnerColors] = useState<Record<number, string>>(() => {
    try {
      const raw = localStorage.getItem('familyTree.ownerColors');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('familyTree.ownerColors', JSON.stringify(customOwnerColors));
    } catch {
      // Ignore localStorage errors in some environments
    }
  }, [customOwnerColors]);

  const ownerColors = useMemo(() => {
    if (!effectiveData) return {} as Record<number, string>;
    const ownerIds: number[] = [];
    Object.values(effectiveData.nodes).forEach((node) => {
      if (node.owner_user_id != null && !ownerIds.includes(node.owner_user_id)) ownerIds.push(node.owner_user_id);
    });
    ownerIds.sort((a, b) => a - b);
    const map: Record<number, string> = {};
    ownerIds.forEach((oid, index) => {
      const fallback = OWNER_PALETTE[index] || generateColorFromIndex(index + OWNER_PALETTE.length);
      const stored = customOwnerColors[oid];
      map[oid] = ensureHexColor(stored || fallback);
    });
    return map;
  }, [effectiveData, customOwnerColors]);

  const alterOptions = useMemo<AlterOption[]>(() => {
    if (!data) return [];
    return Object.values(data.nodes)
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

  const filterActive = treeFilter.enabled && treeFilter.alterId != null;

  const selectedAlter = useMemo(() => {
    if (!data || treeFilter.alterId == null) return null;
    return data.nodes[treeFilter.alterId] ?? null;
  }, [data, treeFilter.alterId]);

  const filteredAlterCount = effectiveData ? Object.keys(effectiveData.nodes).length : 0;

  const filterSummary = filterActive && selectedAlter
    ? `${selectedAlter.name || `#${selectedAlter.id}`} (↑${formatLayerLimit(treeFilter.layersUp)} ↓${formatLayerLimit(treeFilter.layersDown)} ↔${formatLayerLimit(treeFilter.layersSide)})`
    : null;

  const openFilterDialog = () => {
    setFilterDraft(treeFilter);
    setFilterOpen(true);
  };

  const closeFilterDialog = () => setFilterOpen(false);

  const updateFilterDraft = (patch: Partial<TreeFilterState>) => {
    setFilterDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const applyFilterDraftChanges = () => {
    if (!filterDraft) {
      setFilterOpen(false);
      return;
    }
    const next = normalizeTreeFilter(filterDraft);
    const enforced = next.alterId == null ? { ...next, enabled: false } : next;
    setTreeFilter(enforced);
    setFilterOpen(false);
  };

  const clearTreeFilter = () => {
    setTreeFilter(createDefaultTreeFilter());
    setFilterOpen(false);
  };

  const filterDraftPreview = useMemo(() => {
    if (!data || !filterDraft) return null;
    const normalized = normalizeTreeFilter(filterDraft);
    if (!normalized.enabled || normalized.alterId == null) return null;
    return applyTreeFilter(data, normalized);
  }, [data, filterDraft]);

  const draftPreviewCount = filterDraftPreview ? Object.keys(filterDraftPreview.nodes).length : 0;

  const navigate = useNavigate();
  const openAlter = useCallback(
    (alterId: number) => {
      navigate(`/detail/${alterId}`);
    },
    [navigate],
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.alters.familyTree();
        if (!result) throw new Error('Failed to fetch family tree data');
        setData(result as FamilyTreeResponse);
      } catch (e: any) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, reloadNonce]);

  return (
    <>
      <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Family Tree
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="List" />
          <Tab label="Graph" />
        </Tabs>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            mb: 2,
          }}
        >
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or id"
            sx={{ minWidth: { xs: '100%', sm: 240 }, flexGrow: 1 }}
          />
          <Button
            size="small"
            variant={filterActive ? 'contained' : 'outlined'}
            color="primary"
            startIcon={<FilterAltIcon fontSize="small" />}
            onClick={openFilterDialog}
          >
            {filterActive ? 'Filter active' : 'Filter tree'}
          </Button>
          <Button size="small" variant="outlined" onClick={() => setReloadNonce((n) => n + 1)}>
            Force Reload
          </Button>
          <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={() => setSettingsOpen(true)}
            sx={{ marginLeft: { xs: 0, sm: 'auto' } }}
          >
            Settings
          </Button>
        </Box>
        {effectiveData && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              mb: tab === 1 ? 2 : 2,
            }}
          >
            <Typography variant="caption" color={filterActive ? 'primary' : 'text.secondary'}>
              {filterActive && filterSummary
                ? `Tree filter: ${filterSummary}`
                : `Showing ${filteredAlterCount} alters`}
            </Typography>
            {filterActive && (
              <Button size="small" variant="text" onClick={clearTreeFilter}>
                Clear
              </Button>
            )}
          </Box>
        )}
        {tab === 1 && (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            {colorMode === 'role' && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%' }}>
                {Object.entries(roleColors).map(([role, color]) => (
                  <Chip
                    key={role}
                    size="small"
                    label={role}
                    sx={{ backgroundColor: color, color: getReadableTextColor(color) }}
                  />
                ))}
              </Stack>
            )}
            {colorMode === 'owner' && effectiveData && (
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ maxWidth: '100%', alignItems: 'center' }}>
                {Object.entries(ownerColors).map(([oidStr, color]) => {
                  const oid = Number(oidStr);
                  const meta = effectiveData.owners && effectiveData.owners[oidStr];
                  const kind = meta?.is_system ? 'System' : 'User';
                  const label = meta?.username ? `${kind}: ${meta.username}` : `${kind} #${oid}`;
                  const colorHex = ensureHexColor(color);
                  const textColor = getReadableTextColor(colorHex);
                  return (
                    <Box
                      key={oid}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid #444',
                        borderRadius: 2,
                        p: 0.5,
                        gap: 0.5,
                      }}
                    >
                      <Chip size="small" label={label} sx={{ backgroundColor: colorHex, color: textColor, fontWeight: 500 }} />
                      <input
                        type="color"
                        value={colorHex}
                        onChange={(e) => setCustomOwnerColors((prev) => ({ ...prev, [oid]: e.target.value }))}
                        style={{ width: 32, height: 28, background: 'transparent', border: 'none', cursor: 'pointer' }}
                        title="Pick color"
                      />
                      <IconButton
                        size="small"
                        onClick={() =>
                          setCustomOwnerColors((prev) => {
                            const n = { ...prev };
                            delete n[oid];
                            return n;
                          })
                        }
                      >
                        <PaletteIcon fontSize="inherit" />
                      </IconButton>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
        {loading && <CircularProgress size={28} />}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && effectiveData && tab === 0 && (
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              Expand / collapse nodes. Nodes with multiple parents appear under each parent and are marked as (ref).
            </Typography>
            <Box sx={{ maxHeight: '70vh', overflow: 'auto', pr: 1 }}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {effectiveData.roots.map((r) => (
                  <NodeView key={r.id} node={r} all={effectiveData.nodes} toggle={toggle} isCollapsed={isCollapsed} />
                ))}
              </ul>
            </Box>
          </Stack>
        )}
        {!loading && !error && effectiveData && tab === 1 && (
          <Box sx={{ overflow: 'auto', maxHeight: '80vh' }}>
            <FamilyTreeGraph
              data={effectiveData}
              highlight={search}
              roleColors={roleColors}
              ownerColors={ownerColors}
              colorMode={colorMode}
              layoutMode={layoutMode}
              excludeIsolated={excludeIsolated}
              graphTheme={graphTheme}
              onOpenAlter={openAlter}
            />
            <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.6 }}>
              Line appearance follows your current theme. Solid lines represent parent / child relationships, dashed
              strokes connect partners, and dotted lines link user accounts.
            </Typography>
          </Box>
        )}
        </CardContent>
      </Card>
      <Dialog open={filterOpen} onClose={closeFilterDialog} fullWidth maxWidth="sm">
        <DialogTitle>Filter family tree</DialogTitle>
        <DialogContent dividers>
          {filterDraft ? (
            <Stack spacing={3} sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterDraft.enabled}
                    onChange={(event) => updateFilterDraft({ enabled: event.target.checked })}
                  />
                }
                label="Enable tree filter"
              />
              <Autocomplete
                options={alterOptions}
                value={
                  filterDraft.alterId != null
                    ? alterOptions.find((option) => option.id === filterDraft.alterId) ?? null
                    : null
                }
                onChange={(_, option) => updateFilterDraft({ alterId: option?.id ?? null })}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{option.label}</Typography>
                      {option.subtitle && (
                        <Typography variant="caption" color="text.secondary">
                          {option.subtitle}
                        </Typography>
                      )}
                    </Box>
                  </li>
                )}
                renderInput={(params) => <TextField {...params} label="Center alter" size="small" />}
                disabled={!filterDraft.enabled}
                noOptionsText="No matching alters"
                fullWidth
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
                <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Ancestors
                  </Typography>
                  <FormControl size="small" disabled={!filterDraft.enabled}>
                    <Select
                      value={String(filterDraft.layersUp)}
                      onChange={(event) =>
                        updateFilterDraft({ layersUp: parseLayerLimitValue(String(event.target.value)) })
                      }
                    >
                      {LAYER_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value === 'all' ? 'all' : option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
                <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Descendants
                  </Typography>
                  <FormControl size="small" disabled={!filterDraft.enabled}>
                    <Select
                      value={String(filterDraft.layersDown)}
                      onChange={(event) =>
                        updateFilterDraft({ layersDown: parseLayerLimitValue(String(event.target.value)) })
                      }
                    >
                      {LAYER_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value === 'all' ? 'all' : option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
                <Stack spacing={0.5} sx={{ minWidth: 140 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    Partners &amp; siblings
                  </Typography>
                  <FormControl size="small" disabled={!filterDraft.enabled}>
                    <Select
                      value={String(filterDraft.layersSide)}
                      onChange={(event) =>
                        updateFilterDraft({ layersSide: parseLayerLimitValue(String(event.target.value)) })
                      }
                    >
                      {LAYER_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value === 'all' ? 'all' : option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {filterDraft.enabled && filterDraft.alterId != null
                  ? draftPreviewCount > 0
                    ? `Preview includes ${draftPreviewCount} alters.`
                    : 'No alters would remain with the current limits.'
                  : 'Enable the filter and choose an alter to preview the results.'}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Loading filter options...
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFilterDialog}>Cancel</Button>
          <Button onClick={clearTreeFilter} disabled={!filterActive} color="secondary">
            Clear filter
          </Button>
          <Button
            onClick={applyFilterDraftChanges}
            variant="contained"
            disabled={!(filterDraft?.enabled && filterDraft?.alterId != null)}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={settingsOpen} onClose={handleSettingsClose} fullWidth maxWidth="md">
      <DialogTitle>Family tree settings</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Layout</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={layoutMode}
              onChange={(_, next) => next && updateSettings({ layoutMode: next as LayoutModeSetting })}
            >
              <ToggleButton value="hierarchy">Family layout</ToggleButton>
              <ToggleButton value="group">Group layout</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Coloring</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={colorMode}
              onChange={(_, next) => next && updateSettings({ colorMode: next as ColorModeSetting })}
            >
              <ToggleButton value="role">By role</ToggleButton>
              <ToggleButton value="owner">By owner</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <FormControlLabel
            control={
              <Checkbox
                checked={excludeIsolated}
                onChange={(event) => updateSettings({ excludeIsolated: event.target.checked })}
              />
            }
            label="Exclude singular, unconnected nodes"
          />

          <Divider />

          <Stack spacing={1}>
            <Typography variant="subtitle2">Line theme</Typography>
            <FormControl size="small" sx={{ maxWidth: 280 }}>
              <Select value={settings.lineTheme} onChange={handleLineThemeSelect}>
                {Object.entries(LINE_THEME_PRESETS).map(([key, preset]) => (
                  <MenuItem key={key} value={key}>
                    {preset.label}
                  </MenuItem>
                ))}
                <MenuItem value="custom" disabled>
                  Custom (modified)
                </MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {activeLineThemeDescription}
            </Typography>
            <Button size="small" variant="text" onClick={handleResetTheme} sx={{ alignSelf: 'flex-start' }}>
              Reset theme to default
            </Button>
          </Stack>

          <Divider />

          <Stack spacing={2}>
            <Typography variant="subtitle2">Theme editor</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">Background</Typography>
                <input
                  type="color"
                  value={graphTheme.backgroundColor}
                  onChange={(e) => handleBackgroundColorChange(e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">Alter border</Typography>
                <input
                  type="color"
                  value={graphTheme.node.alterBorder}
                  onChange={(e) => handleNodeBorderChange('alterBorder', e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">User border</Typography>
                <input
                  type="color"
                  value={graphTheme.node.userBorder}
                  onChange={(e) => handleNodeBorderChange('userBorder', e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">Highlight border</Typography>
                <input
                  type="color"
                  value={graphTheme.node.highlightBorder}
                  onChange={(e) => handleNodeBorderChange('highlightBorder', e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </Box>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Edge styles
              </Typography>
              <Stack spacing={1.5}>
                {EDGE_KINDS.map((kind) => {
                  const appearance = graphTheme.edges[kind];
                  const dashValue = DASH_OPTIONS.find((option) => option.dash === (appearance.dash ?? null))?.value ??
                    'solid';
                  return (
                    <Stack
                      key={kind}
                      direction="row"
                      spacing={2}
                      flexWrap="wrap"
                      alignItems="center"
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1,
                      }}
                    >
                      <Typography variant="body2" sx={{ minWidth: 150, fontWeight: 600 }}>
                        {EDGE_LABELS[kind]}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption">Color</Typography>
                        <input
                          type="color"
                          value={appearance.color}
                          onChange={(e) => handleEdgeColorChange(kind, e.target.value)}
                          style={{ width: 36, height: 26, border: 'none', background: 'transparent', cursor: 'pointer' }}
                        />
                      </Box>
                      <TextField
                        size="small"
                        type="number"
                        label="Width"
                        value={appearance.width.toFixed(1)}
                        onChange={(e) => handleEdgeWidthChange(kind, parseFloat(e.target.value))}
                        inputProps={{ step: 0.1, min: 0.5, max: 6 }}
                        sx={{ width: 100 }}
                      />
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select value={dashValue} onChange={(event) => handleEdgeDashChange(kind, event.target.value)}>
                          {DASH_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption">Opacity</Typography>
                        <Slider
                          size="small"
                          min={10}
                          max={100}
                          step={5}
                          value={Math.round((appearance.opacity ?? 0.85) * 100)}
                          onChange={(_, value) => {
                            const percent = Array.isArray(value) ? value[0] : value;
                            handleEdgeOpacityChange(kind, percent / 100);
                          }}
                          sx={{ width: 140 }}
                          valueLabelDisplay="auto"
                        />
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </DialogContent>
        <DialogActions>
          <Button onClick={handleSettingsClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
