import type { FamilyTreeNodeData, FamilyTreeOwner, FamilyTreeResponse } from '../../types';

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

export interface GraphNodeBase {
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

export interface GraphNode extends GraphNodeBase {
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: number;
  target: number;
  kind: EdgeKind;
  sourcePoint: Point;
  targetPoint: Point;
  points?: Point[];
}

export interface BaseEdge {
  id: string;
  source: number;
  target: number;
  kind: EdgeKind;
}

export interface Point {
  x: number;
  y: number;
}

export interface LayoutGroup {
  key: string;
  title: string;
  x: number;
  y: number;
  color?: string;
}

export interface BaseGraph {
  nodes: Map<number, GraphNodeBase>;
  edges: BaseEdge[];
  parentMap: Map<number, Set<number>>;
  childMap: Map<number, Set<number>>;
}

export interface LayoutComputation {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  groups?: LayoutGroup[];
}

export interface LayoutSnapshot {
  positions: Map<number, Point>;
  width: number;
  height: number;
  groups?: LayoutGroup[];
  edgePaths?: Map<string, Point[]>;
}

export type ColorMode = 'role' | 'owner';
export type LayoutMode = 'hierarchy' | 'group';

export interface FamilyTreeGraphProps {
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
