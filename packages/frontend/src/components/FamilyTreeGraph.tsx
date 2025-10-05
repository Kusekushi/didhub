import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import dagre from 'dagre';
import * as d3 from 'd3';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import type { FamilyTreeNodeData, FamilyTreeOwner, FamilyTreeResponse } from '@didhub/api-client';
import { ensureHexColor, getReadableTextColor } from '../utils/color';

type LayoutMode = 'hierarchy' | 'group';
type ColorMode = 'role' | 'owner';

export const EDGE_KINDS = ['parent', 'partner', 'user-partner', 'user-parent', 'user-child'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface EdgeAppearance {
  color: string;
  width: number;
  dash?: string | null;
  opacity?: number;
}

export interface GraphTheme {
  backgroundColor: string;
  node: {
    userBorder: string;
    alterBorder: string;
    highlightBorder: string;
  };
  edges: Record<EdgeKind, EdgeAppearance>;
}

interface FamilyTreeGraphProps {
  data: FamilyTreeResponse;
  highlight: string;
  roleColors: Record<string, string>;
  ownerColors: Record<number, string>;
  colorMode: ColorMode;
  layoutMode: LayoutMode;
  excludeIsolated: boolean;
  graphTheme?: GraphTheme;
  onOpenAlter?: (id: number) => void;
}

interface GraphNodeBase {
  id: number;
  label: string;
  type: 'alter' | 'user';
  meta: FamilyTreeNodeData | FamilyTreeOwner;
  ownerId?: number;
  ownerLabel?: string;
  roles: string[];
  age?: string;
  isSystemUser?: boolean;
}

interface GraphNode extends GraphNodeBase {
  x: number;
  y: number;
}

interface GraphEdge {
  id: string;
  source: number;
  target: number;
  kind: EdgeKind;
  sourcePoint: Point;
  targetPoint: Point;
  points?: Point[];
}

interface BaseEdge {
  id: string;
  source: number;
  target: number;
  kind: EdgeKind;
}

interface Point {
  x: number;
  y: number;
}

interface LayoutGroup {
  key: string;
  title: string;
  x: number;
  y: number;
  color?: string;
}

interface BaseGraph {
  nodes: Map<number, GraphNodeBase>;
  edges: BaseEdge[];
  parentMap: Map<number, Set<number>>;
  childMap: Map<number, Set<number>>;
}

interface LayoutComputation {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  groups?: LayoutGroup[];
}

interface LayoutSnapshot {
  positions: Map<number, Point>;
  width: number;
  height: number;
  groups?: LayoutGroup[];
  edgePaths?: Map<string, Point[]>;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 72;
const H_SPACING = 220;
const V_SPACING = 150;
const MARGIN_X = 120;
const MARGIN_Y = 120;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.2;
const COMPONENT_GAP_X = 260;

export const DEFAULT_GRAPH_THEME: GraphTheme = {
  backgroundColor: '#0b121b',
  node: {
    userBorder: '#ffa000',
    alterBorder: '#0d3c61',
    highlightBorder: '#ffffff',
  },
  edges: {
    parent: { color: '#82aaff', width: 2.2, dash: null, opacity: 0.85 },
    partner: { color: '#c792ea', width: 2, dash: '8 4', opacity: 0.75 },
    'user-partner': { color: '#66bb6a', width: 2, dash: '4 4', opacity: 0.7 },
    'user-parent': { color: '#4dd0e1', width: 2, dash: '4 4', opacity: 0.7 },
    'user-child': { color: '#81c784', width: 2, dash: '4 4', opacity: 0.7 },
  },
};

function resolveGraphTheme(theme?: GraphTheme): GraphTheme {
  if (!theme) return DEFAULT_GRAPH_THEME;

  const mergedEdges: Record<EdgeKind, EdgeAppearance> = EDGE_KINDS.reduce((acc, key) => {
    const base = DEFAULT_GRAPH_THEME.edges[key];
    const override = theme.edges[key];
    acc[key] = {
      color: ensureHexColor(override?.color || base.color),
      width: override?.width ?? base.width,
      dash: override?.dash ?? base.dash ?? null,
      opacity: override?.opacity ?? base.opacity,
    };
    return acc;
  }, {} as Record<EdgeKind, EdgeAppearance>);

  const backgroundColor = (() => {
    const value = theme.backgroundColor?.trim() ?? '';
    return /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : DEFAULT_GRAPH_THEME.backgroundColor;
  })();

  return {
    backgroundColor,
    node: {
      userBorder: ensureHexColor(theme.node?.userBorder || DEFAULT_GRAPH_THEME.node.userBorder),
      alterBorder: ensureHexColor(theme.node?.alterBorder || DEFAULT_GRAPH_THEME.node.alterBorder),
      highlightBorder: ensureHexColor(theme.node?.highlightBorder || DEFAULT_GRAPH_THEME.node.highlightBorder),
    },
    edges: mergedEdges,
  };
}

function collectBaseGraph(data: FamilyTreeResponse): BaseGraph {
  const nodes = new Map<number, GraphNodeBase>();
  const parentMap = new Map<number, Set<number>>();
  const childMap = new Map<number, Set<number>>();
  const edges: BaseEdge[] = [];

  const ownerList = Object.values(data.owners || {});
  const ownerMap = new Map<number, FamilyTreeOwner>();
  ownerList.forEach((owner) => {
    ownerMap.set(owner.id, owner);
  });

  Object.values(data.nodes).forEach((node) => {
    const ownerMeta = node.owner_user_id != null ? ownerMap.get(node.owner_user_id) : undefined;
    const ownerLabel = ownerMeta
      ? `${ownerMeta.is_system ? 'System' : 'User'}: ${ownerMeta.username || '#' + ownerMeta.id}`
      : undefined;
    const rolesRaw = node.system_roles || [];
    const roles = Array.isArray(rolesRaw) ? rolesRaw : rolesRaw ? [rolesRaw] : [];
    nodes.set(node.id, {
      id: node.id,
      label: node.name || `#${node.id}`,
      type: 'alter',
      meta: node,
      ownerId: node.owner_user_id ?? undefined,
      ownerLabel,
      roles,
      age: node.age,
    });
  });

  ownerList.forEach((owner) => {
    if (owner.is_system) return;
    if (!nodes.has(owner.id)) {
      nodes.set(owner.id, {
        id: owner.id,
        label: owner.username || `User ${owner.id}`,
        type: 'user',
        meta: owner,
        roles: [],
        isSystemUser: owner.is_system,
      });
    }
  });

  const ensureSet = (map: Map<number, Set<number>>, key: number) => {
    if (!map.has(key)) map.set(key, new Set<number>());
    return map.get(key)!;
  };

  data.edges.parent.forEach(([parentId, childId]) => {
    if (!nodes.has(parentId) || !nodes.has(childId)) return;
    edges.push({ id: `parent-${parentId}-${childId}`, source: parentId, target: childId, kind: 'parent' });
    ensureSet(childMap, parentId).add(childId);
    ensureSet(parentMap, childId).add(parentId);
  });

  data.edges.partner.forEach(([a, b]) => {
    if (!nodes.has(a) || !nodes.has(b)) return;
    edges.push({ id: `partner-${a}-${b}`, source: a, target: b, kind: 'partner' });
  });

  Object.values(data.nodes).forEach((node) => {
    const userPartners = node.user_partners || [];
    userPartners.forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-partner-${node.id}-${userId}`, source: node.id, target: userId, kind: 'user-partner' });
    });

    const userParents = node.user_parents || [];
    userParents.forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-parent-${userId}-${node.id}`, source: userId, target: node.id, kind: 'user-parent' });
      ensureSet(childMap, userId).add(node.id);
      ensureSet(parentMap, node.id).add(userId);
    });

    const userChildren = node.user_children || [];
    userChildren.forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-child-${node.id}-${userId}`, source: node.id, target: userId, kind: 'user-child' });
      ensureSet(childMap, node.id).add(userId);
      ensureSet(parentMap, userId).add(node.id);
    });

    const alterChildren = node.children || [];
    alterChildren.forEach((childId) => {
      if (!nodes.has(childId)) return;
      ensureSet(childMap, node.id).add(childId);
      ensureSet(parentMap, childId).add(node.id);
    });
  });

  return { nodes, edges, parentMap, childMap };
}

function pruneIsolatedNodes(graph: BaseGraph): BaseGraph {
  const connected = new Set<number>();
  graph.edges.forEach((edge) => {
    connected.add(edge.source);
    connected.add(edge.target);
  });

  const nodes = new Map<number, GraphNodeBase>();
  graph.nodes.forEach((node, id) => {
    const parentCount = graph.parentMap.get(id)?.size ?? 0;
    const childCount = graph.childMap.get(id)?.size ?? 0;
    if (connected.has(id) || parentCount > 0 || childCount > 0) {
      nodes.set(id, node);
    }
  });

  if (nodes.size === graph.nodes.size) {
    return graph;
  }

  const edges = graph.edges.filter((edge) => nodes.has(edge.source) && nodes.has(edge.target));

  const parentMap = new Map<number, Set<number>>();
  const childMap = new Map<number, Set<number>>();

  nodes.forEach((_, id) => {
    const parents = graph.parentMap.get(id);
    if (parents) {
      const filtered = new Set<number>();
      parents.forEach((pid) => {
        if (nodes.has(pid)) filtered.add(pid);
      });
      if (filtered.size) parentMap.set(id, filtered);
    }

    const children = graph.childMap.get(id);
    if (children) {
      const filtered = new Set<number>();
      children.forEach((cid) => {
        if (nodes.has(cid)) filtered.add(cid);
      });
      if (filtered.size) childMap.set(id, filtered);
    }
  });

  return { nodes, edges, parentMap, childMap };
}

function computeHierarchicalLayout(graph: BaseGraph): LayoutSnapshot {
  if (!graph.nodes.size) {
    return {
      positions: new Map<number, Point>(),
      width: NODE_WIDTH + MARGIN_X * 2,
      height: NODE_HEIGHT + MARGIN_Y * 2,
      groups: undefined,
      edgePaths: undefined,
    };
  }

  const components = buildComponents(graph);
  if (components.length <= 1) {
    return layoutComponentGraph(graph);
  }

  const positions = new Map<number, Point>();
  const combinedEdgePaths = new Map<string, Point[]>();
  let totalWidth = 0;
  let maxHeight = NODE_HEIGHT + MARGIN_Y * 2;

  components.forEach((componentIds, index) => {
    const componentGraph = sliceGraph(graph, componentIds);
    const componentLayout = layoutComponentGraph(componentGraph);
    const startX = totalWidth;

    componentLayout.positions.forEach((point, nodeId) => {
      positions.set(nodeId, { x: point.x + startX, y: point.y });
    });

    componentLayout.edgePaths?.forEach((points, edgeId) => {
      combinedEdgePaths.set(
        edgeId,
        points.map((pt) => ({ x: pt.x + startX, y: pt.y })),
      );
    });

    maxHeight = Math.max(maxHeight, componentLayout.height);
    totalWidth = startX + componentLayout.width;
    if (index < components.length - 1) {
      totalWidth += COMPONENT_GAP_X;
    }
  });

  const width = Math.max(totalWidth, NODE_WIDTH + MARGIN_X * 2);

  return {
    positions,
    width,
    height: maxHeight,
    groups: undefined,
    edgePaths: combinedEdgePaths.size ? combinedEdgePaths : undefined,
  };
}

function buildComponents(graph: BaseGraph): Array<Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  graph.nodes.forEach((_, id) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set<number>());
  });

  graph.edges.forEach((edge) => {
    const from = adjacency.get(edge.source);
    const to = adjacency.get(edge.target);
    from?.add(edge.target);
    to?.add(edge.source);
  });

  const visited = new Set<number>();
  const components: Array<Set<number>> = [];

  adjacency.forEach((_, nodeId) => {
    if (visited.has(nodeId)) return;
    const queue: number[] = [nodeId];
    const component = new Set<number>();
    visited.add(nodeId);
    while (queue.length) {
      const current = queue.shift()!;
      component.add(current);
      const neighbors = adjacency.get(current);
      neighbors?.forEach((next) => {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }
    components.push(component);
  });

  return components;
}

function sliceGraph(graph: BaseGraph, ids: Set<number>): BaseGraph {
  const nodes = new Map<number, GraphNodeBase>();
  ids.forEach((id) => {
    const node = graph.nodes.get(id);
    if (node) nodes.set(id, node);
  });

  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));

  const parentMap = new Map<number, Set<number>>();
  const childMap = new Map<number, Set<number>>();

  ids.forEach((id) => {
    const parents = graph.parentMap.get(id);
    if (parents) {
      const filtered = new Set<number>();
      parents.forEach((pid) => {
        if (ids.has(pid)) filtered.add(pid);
      });
      if (filtered.size) parentMap.set(id, filtered);
    }

    const children = graph.childMap.get(id);
    if (children) {
      const filtered = new Set<number>();
      children.forEach((cid) => {
        if (ids.has(cid)) filtered.add(cid);
      });
      if (filtered.size) childMap.set(id, filtered);
    }
  });

  return { nodes, edges, parentMap, childMap };
}

function computeNodeRanks(graph: BaseGraph): Map<number, number> {
  const ranks = new Map<number, number>();
  const queue: number[] = [];

  graph.nodes.forEach((node) => {
    const parentCount = graph.parentMap.get(node.id)?.size ?? 0;
    if (parentCount === 0) {
      ranks.set(node.id, 0);
      queue.push(node.id);
    }
  });

  if (!queue.length) {
    const first = graph.nodes.keys().next();
    if (!first.done) {
      ranks.set(first.value, 0);
      queue.push(first.value);
    }
  }

  while (queue.length) {
    const current = queue.shift()!;
    const currentRank = ranks.get(current) ?? 0;
    const children = graph.childMap.get(current);
    children?.forEach((childId) => {
      const nextRank = currentRank + 1;
      const known = ranks.get(childId);
      if (known == null || nextRank < known) {
        ranks.set(childId, nextRank);
        queue.push(childId);
      }
    });
  }

  graph.nodes.forEach((_, id) => {
    if (!ranks.has(id)) ranks.set(id, 0);
  });

  return ranks;
}

function alignPartnerRanks(graph: BaseGraph, baseRanks: Map<number, number>): Map<number, number> {
  const adjusted = new Map<number, number>(baseRanks);
  const adjacency = new Map<number, Set<number>>();

  graph.edges
    .filter((edge) => edge.kind === 'partner')
    .forEach((edge) => {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set<number>());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set<number>());
      adjacency.get(edge.source)!.add(edge.target);
      adjacency.get(edge.target)!.add(edge.source);
    });

  const visited = new Set<number>();

  adjacency.forEach((_neighbors, nodeId) => {
    if (visited.has(nodeId)) return;
    const stack = [nodeId];
    const group: number[] = [];

    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      group.push(current);
      const neighbors = adjacency.get(current);
      neighbors?.forEach((next) => {
        if (!visited.has(next)) stack.push(next);
      });
    }

    if (group.length <= 1) return;

    let targetRank = Number.POSITIVE_INFINITY;
    group.forEach((id) => {
      const rank = adjusted.get(id);
      if (rank != null && rank < targetRank) {
        targetRank = rank;
      }
    });

    if (!Number.isFinite(targetRank)) targetRank = 0;

    group.forEach((id) => {
      adjusted.set(id, targetRank);
    });
  });

  return adjusted;
}

function fallbackHierarchicalLayout(graph: BaseGraph): LayoutSnapshot {
  const ranks = alignPartnerRanks(graph, computeNodeRanks(graph));
  const positions = new Map<number, Point>();
  const levels = new Map<number, GraphNodeBase[]>();

  ranks.forEach((level, id) => {
    const node = graph.nodes.get(id);
    if (!node) return;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level)!.push(node);
  });

  if (!levels.size) {
    return {
      positions,
      width: NODE_WIDTH + MARGIN_X * 2,
      height: NODE_HEIGHT + MARGIN_Y * 2,
      edgePaths: undefined,
      groups: undefined,
    };
  }

  const sortedLevels = Array.from(levels.entries()).sort((a, b) => a[0] - b[0]);
  const rowSpacing = NODE_WIDTH + H_SPACING;
  let maxNodesPerLevel = 0;

  sortedLevels.forEach(([level, nodesAtLevel]) => {
    const sortedNodes = nodesAtLevel.sort((a, b) => a.label.localeCompare(b.label));
    maxNodesPerLevel = Math.max(maxNodesPerLevel, sortedNodes.length);
    sortedNodes.forEach((node, index) => {
      const x = MARGIN_X + NODE_WIDTH / 2 + index * rowSpacing;
      const y = MARGIN_Y + NODE_HEIGHT / 2 + level * V_SPACING;
      positions.set(node.id, { x, y });
    });
  });

  const maxLevel = sortedLevels[sortedLevels.length - 1][0];

  const width = Math.max(
    NODE_WIDTH + MARGIN_X * 2,
    maxNodesPerLevel
      ? MARGIN_X * 2 + NODE_WIDTH + (maxNodesPerLevel - 1) * rowSpacing
      : NODE_WIDTH + MARGIN_X * 2,
  );

  const height = Math.max(
    NODE_HEIGHT + MARGIN_Y * 2,
    MARGIN_Y * 2 + NODE_HEIGHT + maxLevel * V_SPACING,
  );

  return {
    positions,
    width,
    height,
    edgePaths: undefined,
    groups: undefined,
  };
}

function layoutComponentGraph(graph: BaseGraph): LayoutSnapshot {
  const hierarchicalEdges = graph.edges.filter((edge) =>
    edge.kind === 'parent' || edge.kind === 'user-parent' || edge.kind === 'user-child',
  );

  if (!hierarchicalEdges.length) {
    const positions = new Map<number, Point>();
    const ids = Array.from(graph.nodes.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((node) => node.id);

    ids.forEach((id, index) => {
      const x = MARGIN_X + NODE_WIDTH / 2 + index * (NODE_WIDTH + H_SPACING);
      const y = MARGIN_Y + NODE_HEIGHT / 2;
      positions.set(id, { x, y });
    });

    const width = Math.max(
        ids.length
          ? MARGIN_X * 2 + (ids.length - 1) * (NODE_WIDTH + H_SPACING) + NODE_WIDTH
          : NODE_WIDTH + MARGIN_X * 2,
        NODE_WIDTH + MARGIN_X * 2,
      );
    const height = NODE_HEIGHT + MARGIN_Y * 2;

    return {
      positions,
      width,
      height,
      edgePaths: undefined,
      groups: undefined,
    };
  }

  try {
    const alignedRanks = alignPartnerRanks(graph, computeNodeRanks(graph));
    const dag = new dagre.graphlib.Graph({ multigraph: true, compound: false });
    dag.setGraph({
      rankdir: 'TB',
      ranksep: Math.max(120, V_SPACING),
      nodesep: Math.max(80, H_SPACING - NODE_WIDTH),
      marginx: MARGIN_X,
      marginy: MARGIN_Y,
    });
    dag.setDefaultEdgeLabel(() => ({}));

    graph.nodes.forEach((node) => {
      const config: Record<string, unknown> = { width: NODE_WIDTH, height: NODE_HEIGHT };
      const rank = alignedRanks.get(node.id);
      if (rank != null) {
        config.rank = rank;
      }
      dag.setNode(String(node.id), config);
    });

    const hierarchicalIds = new Set<string>();

    hierarchicalEdges.forEach((edge) => {
      const weight = edge.kind === 'parent' ? 3 : 2;
      dag.setEdge(String(edge.source), String(edge.target), { weight, minlen: 1 }, edge.id);
      hierarchicalIds.add(edge.id);
    });

    graph.edges
      .filter((edge) => edge.kind === 'partner')
      .forEach((edge) => {
        const from = String(Math.min(edge.source, edge.target));
        const to = String(Math.max(edge.source, edge.target));
        const key = `partner-align-${edge.id}`;
        if (!dag.hasEdge(from, to, key)) {
          dag.setEdge(from, to, { weight: 0.5, minlen: 0 }, key);
        }
      });

    dagre.layout(dag);

    const positions = new Map<number, Point>();
    graph.nodes.forEach((node) => {
      const pos = dag.node(String(node.id));
      if (pos) {
        positions.set(node.id, { x: pos.x, y: pos.y });
      }
    });

    const edgePaths = new Map<string, Point[]>();
    dag.edges().forEach((edgeRef) => {
      const key = edgeRef.name ?? `${edgeRef.v}-${edgeRef.w}`;
      if (!hierarchicalIds.has(key)) return;
      const edgeData = dag.edge(edgeRef);
      if (edgeData && Array.isArray(edgeData.points) && edgeData.points.length > 1) {
        edgePaths.set(
          key,
          edgeData.points.map((p) => ({ x: p.x, y: p.y })),
        );
      }
    });

    const graphMeta = dag.graph();
    const width = Math.max(graphMeta?.width ?? 0, NODE_WIDTH + MARGIN_X * 2);
    const height = Math.max(graphMeta?.height ?? 0, NODE_HEIGHT + MARGIN_Y * 2);

    return {
      positions,
      width,
      height,
      edgePaths: edgePaths.size ? edgePaths : undefined,
      groups: undefined,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('FamilyTreeGraph: dagre layout failed, falling back to simple layout', error);
    }
    return fallbackHierarchicalLayout(graph);
  }
}

function computeGroupedLayout(
  graph: BaseGraph,
  colorMode: ColorMode,
  roleColors: Record<string, string>,
  ownerColors: Record<number, string>,
): LayoutSnapshot {
  const { nodes } = graph;
  const groups = new Map<string, { ids: number[]; title: string; color?: string }>();

  const register = (key: string, title: string, color?: string) => {
    if (!groups.has(key)) groups.set(key, { ids: [], title, color });
    return groups.get(key)!;
  };

  nodes.forEach((node) => {
    if (node.type === 'user') {
      const bucket = register('user', 'Linked users', '#ffd54f');
      bucket.ids.push(node.id);
      return;
    }

    if (colorMode === 'owner') {
      const ownerId = node.ownerId;
      if (ownerId != null) {
        const title = node.ownerLabel || `Owner #${ownerId}`;
        const color = ensureHexColor(ownerColors[ownerId]);
        register(`owner-${ownerId}`, title, color).ids.push(node.id);
      } else {
        register('owner-unassigned', 'Unassigned owner', '#9e9e9e').ids.push(node.id);
      }
    } else {
      const primaryRole = node.roles[0] || 'Unassigned';
      const color = ensureHexColor(roleColors[primaryRole]);
      register(`role-${primaryRole}`, primaryRole, color).ids.push(node.id);
    }
  });

  if (!groups.size) {
    register('all', 'Alters', '#90caf9');
  }

  const sortedGroups = Array.from(groups.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const columnWidth = NODE_WIDTH + 140;
  const totalWidth = Math.max(sortedGroups.length * columnWidth + MARGIN_X * 2, NODE_WIDTH + MARGIN_X * 2);
  const maxGroupSize = sortedGroups.reduce((acc, group) => Math.max(acc, group.ids.length), 1);
  const totalHeight = Math.max(MARGIN_Y * 2 + NODE_HEIGHT + (maxGroupSize - 1) * V_SPACING, NODE_HEIGHT + MARGIN_Y * 2);

  const positions = new Map<number, Point>();
  const labelY = Math.max(36, MARGIN_Y * 0.6);
  const layoutGroups: LayoutGroup[] = [];

  sortedGroups.forEach((group, columnIndex) => {
    const xCenter = MARGIN_X + columnIndex * columnWidth + columnWidth / 2;
    layoutGroups.push({ key: group.key, title: group.title, x: xCenter, y: labelY, color: group.color });
    const sortedIds = group.ids
      .map((id) => graph.nodes.get(id)!)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((n) => n.id);
    sortedIds.forEach((id, index) => {
      const y = MARGIN_Y + NODE_HEIGHT / 2 + index * V_SPACING;
      positions.set(id, { x: xCenter, y });
    });
  });

  nodes.forEach((_, id) => {
    if (!positions.has(id)) {
      positions.set(id, { x: MARGIN_X + NODE_WIDTH / 2, y: MARGIN_Y + NODE_HEIGHT / 2 });
    }
  });

  return { positions, width: totalWidth, height: totalHeight, groups: layoutGroups, edgePaths: undefined };
}

function layoutGraph(
  graph: BaseGraph,
  layoutMode: LayoutMode,
  colorMode: ColorMode,
  roleColors: Record<string, string>,
  ownerColors: Record<number, string>,
): LayoutComputation {
  const layout: LayoutSnapshot =
    layoutMode === 'group'
      ? computeGroupedLayout(graph, colorMode, roleColors, ownerColors)
      : computeHierarchicalLayout(graph);

  const nodes: GraphNode[] = [];
  graph.nodes.forEach((node) => {
    const point = layout.positions.get(node.id);
    if (!point) return;
    nodes.push({ ...node, x: point.x, y: point.y });
  });

  const edges: GraphEdge[] = graph.edges
    .map((edge) => {
      const sourcePoint = layout.positions.get(edge.source);
      const targetPoint = layout.positions.get(edge.target);
      if (!sourcePoint || !targetPoint) return null;
      const polyline = layout.edgePaths?.get(edge.id);
      return polyline ? { ...edge, sourcePoint, targetPoint, points: polyline } : { ...edge, sourcePoint, targetPoint };
    })
    .filter((edge): edge is GraphEdge => Boolean(edge));

  return {
    nodes,
    edges,
    width: layout.width,
    height: layout.height,
    groups: layout.groups,
  };
}

export default function FamilyTreeGraph({
  data,
  highlight,
  roleColors,
  ownerColors,
  colorMode,
  layoutMode,
  excludeIsolated,
  graphTheme,
  onOpenAlter,
}: FamilyTreeGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const contentGroupRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [zoomLevel, setZoomLevel] = useState(1);

  const theme = useMemo(() => resolveGraphTheme(graphTheme), [graphTheme]);

  const baseGraph = useMemo(() => {
    const raw = collectBaseGraph(data);
    return excludeIsolated ? pruneIsolatedNodes(raw) : raw;
  }, [data, excludeIsolated]);
  const layout = useMemo(
    () => layoutGraph(baseGraph, layoutMode, colorMode, roleColors, ownerColors),
    [baseGraph, layoutMode, colorMode, roleColors, ownerColors],
  );

  useEffect(() => {
    if (!svgRef.current || !contentGroupRef.current) return undefined;
    const svgSelection = d3.select(svgRef.current);
    const contentSelection = d3.select(contentGroupRef.current);

    transformRef.current = d3.zoomIdentity;
    setZoomLevel(1);
    contentSelection.attr('transform', transformRef.current.toString());

    const behavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
        contentSelection.attr('transform', event.transform.toString());
      });

    zoomBehaviorRef.current = behavior;
    svgSelection.on('.zoom', null);
    svgSelection.call(behavior);
    svgSelection.call(behavior.transform, transformRef.current);

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, [layout.width, layout.height]);

  const highlightTerm = highlight.trim().toLowerCase();
  const highlightedIds = useMemo(() => {
    if (!highlightTerm) return new Set<number>();
    const matches = new Set<number>();
    layout.nodes.forEach((node) => {
      const label = node.label.toLowerCase();
      if (String(node.id) === highlightTerm || label.includes(highlightTerm)) {
        matches.add(node.id);
      }
    });
    return matches;
  }, [highlightTerm, layout.nodes]);

  const isHighlightActive = highlightTerm.length > 0;

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svgSelection = d3.select(svgRef.current);
    svgSelection.transition().duration(120).call(zoomBehaviorRef.current.scaleBy, 1 + ZOOM_STEP);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svgSelection = d3.select(svgRef.current);
    svgSelection
      .transition()
      .duration(120)
      .call(zoomBehaviorRef.current.scaleBy, 1 / (1 + ZOOM_STEP));
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !contentGroupRef.current) return;
    transformRef.current = d3.zoomIdentity;
    const svgSelection = d3.select(svgRef.current);
    svgSelection
      .transition()
      .duration(160)
      .call(zoomBehaviorRef.current.transform, transformRef.current);
  };

  return (
    <Stack spacing={1} sx={{ minWidth: 320 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>
          {layoutMode === 'group' ? 'Grouped by color mode' : 'Hierarchical view'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" onClick={handleZoomOut} disabled={zoomLevel <= ZOOM_MIN + 0.05}>
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton size="small" onClick={handleResetZoom}>
              <CenterFocusStrongIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" onClick={handleZoomIn} disabled={zoomLevel >= ZOOM_MAX - 0.05}>
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          backgroundColor: theme.backgroundColor,
          minHeight: 480,
          maxHeight: '70vh',
          overflow: 'auto',
          p: 2,
        }}
      >
        <svg ref={svgRef} width={layout.width} height={layout.height}>
          <g ref={contentGroupRef}>
            {layout.groups?.map((group) => (
            <g key={group.key}>
              <text
                x={group.x}
                y={group.y}
                textAnchor="middle"
                fill={group.color ? getReadableTextColor(group.color) : '#9fa6b2'}
                style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}
              >
                {group.title}
              </text>
              {group.color && (
                <rect
                  x={group.x - 28}
                  y={group.y + 4}
                  width={56}
                  height={4}
                  fill={ensureHexColor(group.color)}
                  rx={2}
                  opacity={0.6}
                />
              )}
            </g>
          ))}

          <g>
            {layout.edges.map((edge) => {
              const highlighted =
                !isHighlightActive || highlightedIds.has(edge.source) || highlightedIds.has(edge.target);
              const appearance = theme.edges[edge.kind] ?? DEFAULT_GRAPH_THEME.edges[edge.kind];
              const stroke = ensureHexColor(appearance.color, '#ffffff');
              const baseWidth = appearance.width ?? 2;
              const strokeWidth = highlighted ? baseWidth : Math.max(baseWidth * 0.7, 0.85);
              const baseOpacity = appearance.opacity ?? 0.85;
              const opacity = highlighted ? baseOpacity : Math.max(baseOpacity * 0.25, 0.1);
              const dashArray = appearance.dash && appearance.dash.trim().length ? appearance.dash : undefined;
              if (edge.points && edge.points.length > 1) {
                const path = edge.points
                  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
                  .join(' ');
                return (
                  <path
                    key={edge.id}
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray ?? undefined}
                    strokeLinecap="round"
                    opacity={opacity}
                  />
                );
              }
              return (
                <line
                  key={edge.id}
                  x1={edge.sourcePoint.x}
                  y1={edge.sourcePoint.y}
                  x2={edge.targetPoint.x}
                  y2={edge.targetPoint.y}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dashArray ?? undefined}
                  strokeLinecap="round"
                  opacity={opacity}
                />
              );
            })}
          </g>

          <g>
            {layout.nodes.map((node) => {
              const isHighlighted = highlightedIds.has(node.id);
              const opacity = !isHighlightActive ? 1 : isHighlighted ? 1 : 0.25;
              const ownerColor = node.ownerId != null ? ownerColors[node.ownerId] : undefined;
              const roleColor = roleColors[node.roles[0] || 'Unassigned'];
              const colorSource = node.type === 'user' ? '#ffe082' : colorMode === 'owner' ? ownerColor : roleColor;
              const fill = ensureHexColor(colorSource, node.type === 'user' ? '#ffd54f' : '#607d8b');
              const textColor = getReadableTextColor(fill);
              const borderColor = isHighlighted
                ? theme.node.highlightBorder
                : node.type === 'user'
                ? theme.node.userBorder
                : theme.node.alterBorder;
              const displayName = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
              const primaryInfo = (() => {
                if (node.type === 'user') return 'Linked user';
                if (colorMode === 'owner') return node.ownerLabel || 'No owner';
                return node.roles[0] || 'Unassigned';
              })();
              const secondaryInfo = (() => {
                if (node.type === 'user') {
                  const meta = node.meta as FamilyTreeOwner;
                  return meta.is_system ? 'System account' : `#${node.id}`;
                }
                const meta = node.meta as FamilyTreeNodeData;
                if (meta.age) return `Age ${meta.age}`;
                return `#${node.id}`;
              })();
              const tooltipLines: string[] = [node.label, `ID #${node.id}`];
              if (node.type === 'user') {
                const meta = node.meta as FamilyTreeOwner;
                tooltipLines.push(meta.is_system ? 'System account' : 'Linked account');
              } else {
                const meta = node.meta as FamilyTreeNodeData;
                if (meta.age) tooltipLines.push(`Age: ${meta.age}`);
                if (node.ownerLabel) tooltipLines.push(node.ownerLabel);
                if (node.roles.length) tooltipLines.push(`Roles: ${node.roles.join(', ')}`);
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  style={{ cursor: node.type === 'alter' ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (node.type === 'alter' && onOpenAlter) onOpenAlter(node.id);
                  }}
                >
                  <rect
                    x={-NODE_WIDTH / 2}
                    y={-NODE_HEIGHT / 2}
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={18}
                    fill={fill}
                    stroke={borderColor}
                    strokeWidth={isHighlighted ? 3 : 1.4}
                    opacity={opacity}
                  />
                  <text
                    textAnchor="middle"
                    fill={textColor}
                    style={{ fontSize: 13, fontWeight: 600 }}
                    pointerEvents="none"
                  >
                    <tspan x={0} y={-10} fontWeight={600}>
                      {displayName}
                    </tspan>
                    <tspan x={0} y={6} fontSize={12} opacity={0.85}>
                      {primaryInfo}
                    </tspan>
                    <tspan x={0} y={22} fontSize={11} opacity={0.7}>
                      {secondaryInfo}
                    </tspan>
                  </text>
                  <title>{tooltipLines.join('\n')}</title>
                </g>
              );
            })}
          </g>
          </g>
        </svg>
      </Box>
    </Stack>
  );
}