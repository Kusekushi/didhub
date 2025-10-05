import type { FamilyTreeNodeData, FamilyTreeOwner, FamilyTreeResponse } from '../../types';
import type { BaseGraph, BaseEdge, GraphNodeBase } from './types';

const ensureSet = <T>(map: Map<number, Set<T>>, key: number): Set<T> => {
  if (!map.has(key)) map.set(key, new Set<T>());
  return map.get(key)!;
};

export function collectBaseGraph(data: FamilyTreeResponse): BaseGraph {
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
    (node.user_partners || []).forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-partner-${node.id}-${userId}`, source: node.id, target: userId, kind: 'user-partner' });
    });

    (node.user_parents || []).forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-parent-${userId}-${node.id}`, source: userId, target: node.id, kind: 'user-parent' });
      ensureSet(childMap, userId).add(node.id);
      ensureSet(parentMap, node.id).add(userId);
    });

    (node.user_children || []).forEach((userId) => {
      if (!nodes.has(userId)) return;
      edges.push({ id: `user-child-${node.id}-${userId}`, source: node.id, target: userId, kind: 'user-child' });
      ensureSet(childMap, node.id).add(userId);
      ensureSet(parentMap, userId).add(node.id);
    });

    (node.children || []).forEach((childId) => {
      if (!nodes.has(childId)) return;
      ensureSet(childMap, node.id).add(childId);
      ensureSet(parentMap, childId).add(node.id);
    });
  });

  return { nodes, edges, parentMap, childMap };
}

export function pruneIsolatedNodes(graph: BaseGraph): BaseGraph {
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
