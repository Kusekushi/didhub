import { ensureHexColor } from './color';
import { DEFAULT_GRAPH_THEME } from '../components/graph/theme';
import { EDGE_KINDS, type EdgeAppearance, type EdgeKind, type GraphTheme } from '../components/graph/types';

export type LayoutModeSetting = 'hierarchy' | 'group';
export type ColorModeSetting = 'role' | 'owner';
export type LineThemeKey = 'default' | 'contrast' | 'minimal' | 'custom';

export interface FamilyTreeSettings {
  layoutMode: LayoutModeSetting;
  colorMode: ColorModeSetting;
  excludeIsolated: boolean;
  lineTheme: LineThemeKey;
  graphTheme: GraphTheme;
}

export const SETTINGS_STORAGE_KEY = 'familyTree.settings.v1';

export const DASH_OPTIONS = [
  { value: 'solid', label: 'Solid', dash: null as string | null },
  { value: 'dashed', label: 'Dashed', dash: '8 4' },
  { value: 'dotted', label: 'Dotted', dash: '2 6' },
];

export const sanitizeBackgroundColor = (value: string): string => ensureHexColor(value, DEFAULT_GRAPH_THEME.backgroundColor);

export const cloneTheme = (theme: GraphTheme): GraphTheme => ({
  backgroundColor: sanitizeBackgroundColor(theme.backgroundColor),
  node: { ...theme.node },
  edges: EDGE_KINDS.reduce((acc, key) => {
    const source = theme.edges[key];
    acc[key] = { ...source } as EdgeAppearance;
    return acc;
  }, {} as Record<EdgeKind, EdgeAppearance>),
});

export const mergeThemes = (base: GraphTheme, incoming: GraphTheme): GraphTheme => {
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

export const createDefaultSettings = (): FamilyTreeSettings => ({
  layoutMode: 'hierarchy',
  colorMode: 'role',
  excludeIsolated: false,
  lineTheme: 'default',
  graphTheme: cloneTheme(DEFAULT_GRAPH_THEME),
});

export const normalizeSettings = (value?: Partial<FamilyTreeSettings>): FamilyTreeSettings => {
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

export const LINE_THEME_PRESETS: Record<Exclude<LineThemeKey, 'custom'>, { label: string; description: string; create: () => GraphTheme }> = {
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

export const getLineThemeDescription = (lineTheme: LineThemeKey): string =>
  lineTheme !== 'custom'
    ? LINE_THEME_PRESETS[lineTheme as Exclude<LineThemeKey, 'custom'>].description
    : 'Custom theme, tailored using the controls below.';
