import { ensureHexColor } from '../../utils/color';
import { EDGE_KINDS, type EdgeAppearance, type EdgeKind, type GraphTheme } from './types';

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

export function resolveGraphTheme(theme?: GraphTheme): GraphTheme {
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
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_GRAPH_THEME.backgroundColor;
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
