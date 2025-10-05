import type { FamilyTreeNodeData, FamilyTreeOwner, FamilyTreeResponse, NestedFamilyTreeNode } from '../types';

export type LayerLimit = number | 'all';

export interface TreeFilterState {
  enabled: boolean;
  alterId: number | null;
  layersUp: LayerLimit;
  layersDown: LayerLimit;
  layersSide: LayerLimit;
}

export const FILTER_STORAGE_KEY = 'familyTree.filter.v1';

export const LAYER_OPTIONS: Array<{ value: LayerLimit; label: string }> = [
  { value: 0, label: '0 layers' },
  { value: 1, label: '1 layer' },
  { value: 2, label: '2 layers' },
  { value: 3, label: '3 layers' },
  { value: 4, label: '4 layers' },
  { value: 5, label: '5 layers' },
  { value: 'all', label: 'Full depth' },
];

const isValidLayerLimit = (value: LayerLimit | null | undefined): value is LayerLimit =>
  value === 'all' ||
  (typeof value === 'number' &&
    LAYER_OPTIONS.some((option) => typeof option.value === 'number' && option.value === value));

export const createDefaultTreeFilter = (): TreeFilterState => ({
  enabled: false,
  alterId: null,
  layersUp: 2,
  layersDown: 2,
  layersSide: 1,
});

export const normalizeLayerLimit = (value: LayerLimit | null | undefined, fallback: LayerLimit): LayerLimit =>
  isValidLayerLimit(value) ? value : fallback;

export const normalizeTreeFilter = (value?: Partial<TreeFilterState>): TreeFilterState => {
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

export const parseLayerLimitValue = (raw: string): LayerLimit => {
  if (raw === 'all') return 'all';
  const numeric = Number(raw);
  if (Number.isNaN(numeric)) return 0;
  return normalizeLayerLimit(numeric as LayerLimit, 0);
};

export const formatLayerLimit = (limit: LayerLimit): string => (limit === 'all' ? '∞' : String(limit));

const coerceLimit = (limit: LayerLimit): number => (limit === 'all' ? Number.POSITIVE_INFINITY : limit);

interface TraversalBudget {
  up: number;
  down: number;
  side: number;
}

interface QueueEntry extends TraversalBudget {
  id: number;
}

type FilterEdgeType = 'up' | 'down' | 'side';

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

  (Object.values(data.nodes) as FamilyTreeNodeData[]).forEach((node) => {
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

export const applyTreeFilter = (data: FamilyTreeResponse, filter: TreeFilterState): FamilyTreeResponse | null => {
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
