import { createContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { createTheme, ThemeProvider, alpha } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import { useAuth } from './contexts/AuthContext';

export type ThemeDensity = 'comfortable' | 'compact';

export interface ThemePaletteSettings {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  background: string;
  surface: string;
}

export interface ThemeSettings {
  mode: PaletteMode;
  light: ThemePaletteSettings;
  dark: ThemePaletteSettings;
  fontFamily: string;
  fontSize: number;
  borderRadius: number;
  density: ThemeDensity;
  presetId: string | null;
}

export interface ThemePreset {
  id: string;
  label: string;
  description?: string;
  light: ThemePaletteSettings;
  dark: ThemePaletteSettings;
  fontFamily: string;
  fontSize: number;
  borderRadius: number;
  density: ThemeDensity;
  initialMode: PaletteMode;
}

export interface ThemeControllerContext {
  mode: PaletteMode;
  settings: ThemeSettings;
  toggle: () => void;
  setMode: (mode: PaletteMode) => void;
  updatePalette: (mode: PaletteMode, patch: Partial<ThemePaletteSettings>) => void;
  updateBase: (patch: Partial<Omit<ThemeSettings, 'light' | 'dark' | 'mode' | 'presetId'>>) => void;
  applyPreset: (presetId: string, keepCurrentMode?: boolean) => void;
  resetToDefault: (mode?: PaletteMode) => void;
  presets: ThemePreset[];
  currentPresetId: string | null;
  isCustom: boolean;
}

export const ThemeToggleContext = createContext<ThemeControllerContext>({
  mode: 'light',
  settings: {} as ThemeSettings,
  toggle: () => {},
  setMode: () => {},
  updatePalette: () => {},
  updateBase: () => {},
  applyPreset: () => {},
  resetToDefault: () => {},
  presets: [],
  currentPresetId: null,
  isCustom: false,
});

const STORAGE_PREFIX = 'didhub_theme_v2';
const LEGACY_THEME_KEY = 'theme';
const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'didhub-classic',
    label: 'DIDHub Classic',
    description: 'Original light & dark pairing',
    initialMode: 'light',
    light: {
      primary: '#6750A4',
      secondary: '#625B71',
      success: '#386641',
      warning: '#BF7500',
      background: '#F8F7FB',
      surface: '#FFFFFF',
    },
    dark: {
      primary: '#D0BCFF',
      secondary: '#CCC2DC',
      success: '#81C784',
      warning: '#FFB74D',
      background: '#1C1B1F',
      surface: '#2B2930',
    },
    fontFamily: '"Inter", "InterVariable", "Segoe UI", system-ui, sans-serif',
    fontSize: 14,
    borderRadius: 10,
    density: 'comfortable',
  },
  {
    id: 'midnight-neon',
    label: 'Midnight Neon',
    description: 'Dark base with neon accents',
    initialMode: 'dark',
    light: {
      primary: '#006399',
      secondary: '#009688',
      success: '#2E7D32',
      warning: '#F57C00',
      background: '#F1F5F9',
      surface: '#FFFFFF',
    },
    dark: {
      primary: '#4DD0E1',
      secondary: '#80CBC4',
      success: '#66BB6A',
      warning: '#FFB74D',
      background: '#090B1A',
      surface: '#152238',
    },
    fontFamily: '"Space Grotesk", "Segoe UI", system-ui, sans-serif',
    fontSize: 15,
    borderRadius: 16,
    density: 'comfortable',
  },
  {
    id: 'sunrise-pastel',
    label: 'Sunrise Pastel',
    description: 'Soft pastel palette with rounded corners',
    initialMode: 'light',
    light: {
      primary: '#FF8A65',
      secondary: '#9575CD',
      success: '#81C784',
      warning: '#FFB74D',
      background: '#FFF6F0',
      surface: '#FFFFFF',
    },
    dark: {
      primary: '#F48FB1',
      secondary: '#B39DDB',
      success: '#AED581',
      warning: '#FFE082',
      background: '#22111A',
      surface: '#301A24',
    },
    fontFamily: '"Nunito", "Segoe UI", system-ui, sans-serif',
    fontSize: 15,
    borderRadius: 20,
    density: 'comfortable',
  },
  {
    id: 'focused-compact',
    label: 'Focused & Compact',
    description: 'High-contrast palette with compact density',
    initialMode: 'light',
    light: {
      primary: '#1D4ED8',
      secondary: '#7C3AED',
      success: '#15803D',
      warning: '#B45309',
      background: '#F2F4F8',
      surface: '#FFFFFF',
    },
    dark: {
      primary: '#60A5FA',
      secondary: '#C084FC',
      success: '#4ADE80',
      warning: '#F59E0B',
      background: '#101522',
      surface: '#1E2434',
    },
    fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
    fontSize: 13,
    borderRadius: 8,
    density: 'compact',
  },
];

const DEFAULT_PRESET_ID = 'didhub-classic';

const FALLBACK_FONT = '"Inter", "InterVariable", "Segoe UI", system-ui, sans-serif';

function keyForUser(userId: number | string | null | undefined) {
  return `${STORAGE_PREFIX}_${userId ?? 'anon'}`;
}

function isPaletteSettings(value: unknown): value is ThemePaletteSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.primary === 'string' &&
    typeof candidate.secondary === 'string' &&
    typeof candidate.success === 'string' &&
    typeof candidate.warning === 'string' &&
    typeof candidate.background === 'string' &&
    typeof candidate.surface === 'string'
  );
}

function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode;
  const density = candidate.density;
  return (
    (mode === 'light' || mode === 'dark') &&
    isPaletteSettings(candidate.light) &&
    isPaletteSettings(candidate.dark) &&
    typeof candidate.fontFamily === 'string' &&
    typeof candidate.fontSize === 'number' &&
    typeof candidate.borderRadius === 'number' &&
    (density === 'comfortable' || density === 'compact')
  );
}

function parseStoredSettings(raw: string | null): ThemeSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'settings' in (parsed as { settings?: unknown })) {
      const candidate = (parsed as { settings?: unknown }).settings;
      if (isThemeSettings(candidate)) {
        return { ...candidate, presetId: candidate.presetId ?? null };
      }
    }
    if (isThemeSettings(parsed)) {
      return { ...parsed, presetId: parsed.presetId ?? null };
    }
  } catch {
    return null;
  }
  return null;
}

function createSettingsFromPreset(preset: ThemePreset, initialMode?: PaletteMode): ThemeSettings {
  return {
    mode: initialMode ?? preset.initialMode,
    light: { ...preset.light },
    dark: { ...preset.dark },
    fontFamily: preset.fontFamily,
    fontSize: preset.fontSize,
    borderRadius: preset.borderRadius,
    density: preset.density,
    presetId: preset.id,
  };
}

function inferInitialSettings(userId: number | string | null | undefined): ThemeSettings {
  if (typeof window === 'undefined') {
    const preset = THEME_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? THEME_PRESETS[0];
    return createSettingsFromPreset(preset);
  }

  const storageKey = keyForUser(userId);
  const stored = parseStoredSettings(localStorage.getItem(storageKey));
  if (stored) {
    return stored;
  }

  const preset = THEME_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? THEME_PRESETS[0];
  const settings = createSettingsFromPreset(preset);

  // Legacy support: if old `theme` key existed, prefer that mode.
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY) as PaletteMode | null;
    if (legacy === 'dark' || legacy === 'light') {
      settings.mode = legacy;
    }
  } catch {
    /* ignore */
  }

  return settings;
}

function luminance(hexColor: string): number {
  if (!hexColor) return 0;
  const hex = hexColor.replace('#', '');
  if (![3, 6].includes(hex.length)) return 0;
  const normalize =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const parsed = Number.parseInt(normalize, 16);
  if (Number.isNaN(parsed)) return 0;
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  const toLinear = (c: number) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function pickTextColor(background: string, options?: { light?: string; dark?: string; threshold?: number }) {
  const threshold = options?.threshold ?? 0.52;
  const light = options?.light ?? 'rgba(255,255,255,0.92)';
  const dark = options?.dark ?? 'rgba(0,0,0,0.85)';
  const lum = luminance(background);
  return lum > threshold ? dark : light;
}

export default function ThemeContextProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [storageKey, setStorageKey] = useState(() => keyForUser(user?.id ?? null));
  const [settings, setSettings] = useState<ThemeSettings>(() => inferInitialSettings(user?.id ?? null));

  useEffect(() => {
    const key = keyForUser(user?.id ?? null);
    setStorageKey(key);
    setSettings(inferInitialSettings(user?.id ?? null));
  }, [user?.id]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 2, settings }));
    } catch {
      // Ignore write errors (storage full or disabled)
    }
  }, [settings, storageKey]);

  const applyPreset = useCallback((presetId: string, keepCurrentMode = false) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSettings((prev) => ({
      ...createSettingsFromPreset(preset, keepCurrentMode ? prev.mode : undefined),
      mode: keepCurrentMode ? prev.mode : preset.initialMode,
    }));
  }, []);

  const resetToDefault = useCallback(
    (mode?: PaletteMode) => {
      if (mode) {
        const preset = THEME_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? THEME_PRESETS[0];
        setSettings((prev) => ({
          ...prev,
          [mode]: { ...(mode === 'light' ? preset.light : preset.dark) },
          presetId: null,
        }));
        return;
      }
      applyPreset(DEFAULT_PRESET_ID, true);
    },
    [applyPreset],
  );

  const updatePalette = useCallback((mode: PaletteMode, patch: Partial<ThemePaletteSettings>) => {
    setSettings((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], ...patch },
      presetId: null,
    }));
  }, []);

  const updateBase = useCallback((patch: Partial<Omit<ThemeSettings, 'light' | 'dark' | 'mode' | 'presetId'>>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      presetId: null,
    }));
  }, []);

  const setMode = useCallback((mode: PaletteMode) => {
    setSettings((prev) => ({ ...prev, mode }));
  }, []);

  const toggle = useCallback(() => {
    setSettings((prev) => ({ ...prev, mode: prev.mode === 'light' ? 'dark' : 'light' }));
  }, []);

  const theme = useMemo(() => {
    const palette = settings[settings.mode];
    const backgroundText = pickTextColor(palette.background, {
      light: 'rgba(255,255,255,0.92)',
      dark: 'rgba(0,0,0,0.82)',
      threshold: settings.mode === 'light' ? 0.67 : 0.4,
    });
    const surfaceText = pickTextColor(palette.surface, {
      light: 'rgba(255,255,255,0.9)',
      dark: 'rgba(0,0,0,0.78)',
      threshold: settings.mode === 'light' ? 0.65 : 0.45,
    });
    const isCompact = settings.density === 'compact';

    return createTheme({
      palette: {
        mode: settings.mode,
        primary: { main: palette.primary },
        secondary: { main: palette.secondary },
        success: { main: palette.success },
        warning: { main: palette.warning },
        background: {
          default: palette.background,
          paper: palette.surface,
        },
        text: {
          primary: backgroundText,
          secondary: alpha(backgroundText, settings.mode === 'light' ? 0.72 : 0.8),
        },
        divider: alpha(surfaceText, 0.2),
      },
      typography: {
        fontFamily: settings.fontFamily || FALLBACK_FONT,
        fontSize: settings.fontSize,
      },
      shape: {
        borderRadius: settings.borderRadius,
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: {
              backgroundColor: palette.background,
              color: backgroundText,
            },
          },
        },
        MuiButton: {
          defaultProps: {
            size: isCompact ? 'small' : 'medium',
          },
          styleOverrides: {
            root: {
              borderRadius: settings.borderRadius,
            },
          },
        },
        MuiIconButton: {
          defaultProps: {
            size: isCompact ? 'small' : 'medium',
          },
        },
        MuiTextField: {
          defaultProps: {
            size: isCompact ? 'small' : 'medium',
          },
        },
        MuiFormControl: {
          defaultProps: {
            size: isCompact ? 'small' : 'medium',
          },
        },
        MuiListItem: {
          defaultProps: {
            dense: isCompact,
          },
        },
        MuiTable: {
          defaultProps: {
            size: isCompact ? 'small' : 'medium',
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              borderRadius: settings.borderRadius,
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: settings.borderRadius,
            },
          },
        },
      },
    });
  }, [settings]);

  const currentPresetId = useMemo(() => {
    if (settings.presetId) return settings.presetId;
    return null;
  }, [settings.presetId]);

  const contextValue = useMemo<ThemeControllerContext>(
    () => ({
      mode: settings.mode,
      settings,
      toggle,
      setMode,
      updatePalette,
      updateBase,
      applyPreset,
      resetToDefault,
      presets: THEME_PRESETS,
      currentPresetId,
      isCustom: currentPresetId === null,
    }),
    [settings, toggle, setMode, updatePalette, updateBase, applyPreset, resetToDefault, currentPresetId],
  );

  return (
    <ThemeToggleContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeToggleContext.Provider>
  );
}
