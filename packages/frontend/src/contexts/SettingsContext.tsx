import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { getAdminSettings, SETTINGS as SETTINGS_KEYS } from '@didhub/api-client';

type SettingsState = {
  loaded: boolean;
  discordDigestEnabled: boolean;
  emailEnabled: boolean;
  oidcEnabled: boolean;
  shortLinksEnabled: boolean;
  raw: Record<string, any> | null;
};

const defaultState: SettingsState = {
  loaded: false,
  discordDigestEnabled: false,
  emailEnabled: false,
  oidcEnabled: true,
  shortLinksEnabled: true,
  raw: null,
};

const SettingsContext = createContext<SettingsState>(defaultState);

export const SettingsProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [state, setState] = useState<SettingsState>(defaultState);
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    const parseBool = (v: any, def = false) => {
      if (v === null || typeof v === 'undefined') return def;
      const sv = String(v).toLowerCase();
      return sv === '1' || sv === 'true' || sv === 'yes';
    };

    (async () => {
      // If not signed in, don't call admin API (it will 401 and may trigger redirects).
      if (!user) {
        if (mounted) setState((st) => ({ ...st, loaded: true }));
        return;
      }
      try {
        const s = await getAdminSettings();
        if (!mounted) return;
        setState({
          loaded: true,
          discordDigestEnabled: parseBool(s && s[SETTINGS_KEYS.DISCORD_DIGEST_ENABLED]),
          emailEnabled: parseBool(s && s[SETTINGS_KEYS.EMAIL_ENABLED]),
          oidcEnabled: parseBool(s && s[SETTINGS_KEYS.OIDC_ENABLED], true),
          shortLinksEnabled: parseBool(s && s[SETTINGS_KEYS.SHORT_LINKS_ENABLED], true),
          raw: s || {},
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
