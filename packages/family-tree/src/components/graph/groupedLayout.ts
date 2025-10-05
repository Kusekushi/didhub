import { ensureHexColor } from '../../utils/color';
import {
  H_SPACING,
  MARGIN_X,
  MARGIN_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  V_SPACING,
} from './layoutConstants';
import type { BaseGraph, LayoutGroup, LayoutSnapshot } from './types';
import type { ColorMode } from './types';

export function computeGroupedLayout(
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
      register('user', 'Linked users', '#ffd54f').ids.push(node.id);
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

  const positions = new Map<number, { x: number; y: number }>();
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

  return { positions, width: totalWidth, height: totalHeight, groups: layoutGroups };
}
