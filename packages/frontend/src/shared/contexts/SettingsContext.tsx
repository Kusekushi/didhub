import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiClient, SETTINGS as SETTINGS_KEYS } from '@didhub/api-client';

export interface SettingsState {
  loaded: boolean;
  discordDigestEnabled: boolean;
  emailEnabled: boolean;
  oidcEnabled: boolean;
  raw: Record<string, unknown> | null;
}

const defaultState: SettingsState = {
  loaded: false,
  discordDigestEnabled: false,
  emailEnabled: false,
  oidcEnabled: true,
  raw: null,
};

const SettingsContext = createContext<SettingsState>(defaultState);

export const SettingsProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [state, setState] = useState<SettingsState>(defaultState);
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    const parseBool = (value: unknown, def = false): boolean => {
      if (value === null || typeof value === 'undefined') return def;
      const sv = String(value).toLowerCase();
      return sv === '1' || sv === 'true' || sv === 'yes';
    };

    (async () => {
      // If not signed in, don't call admin API (it will 401 and may trigger redirects).
      if (!user) {
        if (mounted) setState((st) => ({ ...st, loaded: true }));
        return;
      }
      try {
        const res = await apiClient.admin.get_settings();
        if (!mounted) return;

        const rawData = res.data as unknown;
        const asArray = Array.isArray(rawData) ? (rawData as Array<Record<string, unknown>>) : [];
        const rawObject: Record<string, unknown> = {};

        for (const entry of asArray) {
          const key = typeof entry.key === 'string' ? entry.key : undefined;
          if (!key) continue;
          const value = (entry as Record<string, unknown>).value;
          rawObject[key] = value ?? null;
        }

        const fallbackRaw =
          !Array.isArray(rawData) && rawData && typeof rawData === 'object'
            ? (rawData as Record<string, unknown>)
            : rawObject;
        const getValue = (key: string) => {
          if (key in rawObject) return rawObject[key];
          return fallbackRaw[key];
        };

        setState({
          loaded: true,
          discordDigestEnabled: parseBool(getValue(SETTINGS_KEYS.DISCORD_DIGEST_ENABLED)),
          emailEnabled: parseBool(getValue(SETTINGS_KEYS.EMAIL_ENABLED)),
          oidcEnabled: parseBool(getValue(SETTINGS_KEYS.OIDC_ENABLED), true),
          raw: fallbackRaw,
        });
      } catch (e) {
        if (mounted) setState((st) => ({ ...st, loaded: true }));
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user]);

  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>;
};

export function useSettings() {
  return useContext(SettingsContext);
}

export default SettingsContext;
