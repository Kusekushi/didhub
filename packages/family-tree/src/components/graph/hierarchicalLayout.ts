import dagre from 'dagre';
import {
  COMPONENT_GAP_X,
  H_SPACING,
  MARGIN_X,
  MARGIN_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  V_SPACING,
} from './layoutConstants';
import type { BaseGraph, GraphNodeBase, LayoutSnapshot, Point } from './types';

export function computeHierarchicalLayout(graph: BaseGraph): LayoutSnapshot {
  if (!graph.nodes.size) {
    return {
      positions: new Map<number, Point>(),
      width: NODE_WIDTH + MARGIN_X * 2,
      height: NODE_HEIGHT + MARGIN_Y * 2,
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
    };
  }

  try {
    const alignedRanks = alignPartnerRanks(graph, computeNodeRanks(graph));
    const dag = new dagre.graphlib.Graph({ multigraph: true, compound: true });
    dag.setGraph({
      rankdir: 'TB',
      ranksep: Math.max(80, V_SPACING),
      nodesep: Math.max(60, H_SPACING - NODE_WIDTH),
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
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('FamilyTreeGraph: dagre layout failed, falling back to simple layout', error);
    }
    return fallbackHierarchicalLayout(graph);
  }
}
