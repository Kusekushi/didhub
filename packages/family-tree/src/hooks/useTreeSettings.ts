import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureHexColor } from '../utils/color';
import {
  DASH_OPTIONS,
  LINE_THEME_PRESETS,
  SETTINGS_STORAGE_KEY,
  cloneTheme,
  createDefaultSettings,
  getLineThemeDescription,
  normalizeSettings,
  sanitizeBackgroundColor,
  type ColorModeSetting,
  type FamilyTreeSettings,
  type LayoutModeSetting,
  type LineThemeKey,
} from '../utils/treeSettings';
import type { EdgeKind, GraphTheme } from '../components/graph/types';

interface TreeSettingsHook {
  settings: FamilyTreeSettings;
  updateSettings: (patch: Partial<FamilyTreeSettings>) => void;
  lineThemeDescription: string;
  handleLineThemeSelect: (value: LineThemeKey) => void;
  handleResetTheme: () => void;
  handleBackgroundColorChange: (color: string) => void;
  handleNodeBorderChange: (key: keyof GraphTheme['node'], color: string) => void;
  handleEdgeColorChange: (kind: EdgeKind, color: string) => void;
  handleEdgeWidthChange: (kind: EdgeKind, width: number) => void;
  handleEdgeDashChange: (kind: EdgeKind, dashValue: string) => void;
  handleEdgeOpacityChange: (kind: EdgeKind, opacity: number) => void;
  dashOptions: typeof DASH_OPTIONS;
  lineThemePresets: typeof LINE_THEME_PRESETS;
}

export function useTreeSettings(): TreeSettingsHook {
  const [settings, setSettings] = useState<FamilyTreeSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FamilyTreeSettings>;
        return normalizeSettings(parsed);
      }
    } catch {
      /* ignore */
    }

    let fallbackColorMode: ColorModeSetting = 'role';
    try {
      const legacy = localStorage.getItem('familyTree.colorMode');
      if (legacy === 'owner') fallbackColorMode = 'owner';
    } catch {
      /* ignore */
    }

    const defaults = createDefaultSettings();
    defaults.colorMode = fallbackColorMode;
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<FamilyTreeSettings>) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...patch }));
  }, []);

  const updateGraphTheme = useCallback((mutator: (theme: GraphTheme) => void, markCustom = true) => {
    setSettings((prev) => {
      const nextTheme = cloneTheme(prev.graphTheme);
      mutator(nextTheme);
      return {
        ...prev,
        lineTheme: markCustom ? 'custom' : prev.lineTheme,
        graphTheme: nextTheme,
      };
    });
  }, []);

  const handleLineThemeSelect = useCallback((value: LineThemeKey) => {
    if (value === 'custom') {
      setSettings((prev) => ({ ...prev, lineTheme: 'custom' }));
      return;
    }
    const preset = LINE_THEME_PRESETS[value as Exclude<LineThemeKey, 'custom'>];
    setSettings((prev) => ({
      ...prev,
      lineTheme: value,
      graphTheme: preset.create(),
    }));
  }, []);

  const handleResetTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      lineTheme: 'default',
      graphTheme: cloneTheme(createDefaultSettings().graphTheme),
    }));
  }, []);

  const handleBackgroundColorChange = useCallback((color: string) => {
    updateGraphTheme((theme) => {
      theme.backgroundColor = sanitizeBackgroundColor(color);
    });
  }, [updateGraphTheme]);

  const handleNodeBorderChange = useCallback((key: keyof GraphTheme['node'], color: string) => {
    updateGraphTheme((theme) => {
      theme.node[key] = ensureHexColor(color);
    });
  }, [updateGraphTheme]);

  const handleEdgeColorChange = useCallback((kind: EdgeKind, color: string) => {
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        color: ensureHexColor(color),
      };
    });
  }, [updateGraphTheme]);

  const handleEdgeWidthChange = useCallback((kind: EdgeKind, width: number) => {
    const clamped = Math.min(Math.max(Number.isFinite(width) ? width : 0, 0.5), 6);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        width: clamped,
      };
    });
  }, [updateGraphTheme]);

  const handleEdgeDashChange = useCallback((kind: EdgeKind, dashValue: string) => {
    const option = DASH_OPTIONS.find((opt) => opt.value === dashValue);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        dash: option?.dash ?? null,
      };
    });
  }, [updateGraphTheme]);

  const handleEdgeOpacityChange = useCallback((kind: EdgeKind, opacity: number) => {
    const clamped = Math.min(Math.max(opacity, 0.1), 1);
    updateGraphTheme((theme) => {
      theme.edges[kind] = {
        ...theme.edges[kind],
        opacity: clamped,
      };
    });
  }, [updateGraphTheme]);

  const lineThemeDescription = useMemo(
    () => getLineThemeDescription(settings.lineTheme),
    [settings.lineTheme],
  );

  return {
    settings,
    updateSettings,
    lineThemeDescription,
    handleLineThemeSelect,
    handleResetTheme,
    handleBackgroundColorChange,
    handleNodeBorderChange,
    handleEdgeColorChange,
    handleEdgeWidthChange,
    handleEdgeDashChange,
    handleEdgeOpacityChange,
    dashOptions: DASH_OPTIONS,
    lineThemePresets: LINE_THEME_PRESETS,
  };
}
