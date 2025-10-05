import type { BaseGraph, GraphEdge, GraphNode, LayoutComputation, LayoutMode } from './types';
import type { ColorMode } from './types';
import { computeHierarchicalLayout } from './hierarchicalLayout';
import { computeGroupedLayout } from './groupedLayout';

export function layoutGraph(
  graph: BaseGraph,
  layoutMode: LayoutMode,
  colorMode: ColorMode,
  roleColors: Record<string, string>,
  ownerColors: Record<number, string>,
): LayoutComputation {
  const layoutSnapshot =
    layoutMode === 'group'
      ? computeGroupedLayout(graph, colorMode, roleColors, ownerColors)
      : computeHierarchicalLayout(graph);

  const nodes: GraphNode[] = [];
  graph.nodes.forEach((node) => {
    const point = layoutSnapshot.positions.get(node.id);
    if (!point) return;
    nodes.push({ ...node, x: point.x, y: point.y });
  });

  const edges: GraphEdge[] = graph.edges
    .map((edge) => {
      const sourcePoint = layoutSnapshot.positions.get(edge.source);
      const targetPoint = layoutSnapshot.positions.get(edge.target);
      if (!sourcePoint || !targetPoint) return null;
      const polyline = layoutSnapshot.edgePaths?.get(edge.id);
      return polyline
        ? { ...edge, sourcePoint, targetPoint, points: polyline }
        : { ...edge, sourcePoint, targetPoint };
    })
    .filter((edge): edge is GraphEdge => Boolean(edge));

  return {
    nodes,
    edges,
    width: layoutSnapshot.width,
    height: layoutSnapshot.height,
    groups: layoutSnapshot.groups,
  };
}
