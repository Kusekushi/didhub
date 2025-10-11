import { useState, useCallback } from 'react';
import { apiClient } from '@didhub/api-client';
import { normalizeEntityId } from '../utils/alterFormUtils';

function debugLog(...args: unknown[]) {
  console.debug('[UserRelationships]', ...args);
}

/**
 * Hook for managing user relationship options
 */
export function useUserRelationshipOptions() {
  const [userPartnerOptions, setUserPartnerOptions] = useState<string[]>([]);
  // IDs are UUID strings only; store id values as normalized string form.
  const [userPartnerMap, setUserPartnerMap] = useState<Record<string, string>>({});
  const [userIdNameMap, setUserIdNameMap] = useState<Record<string, string>>({});

  const refreshUserOptions = useCallback(async () => {
    try {
      const result = (await apiClient.admin.get_users({ perPage: 200 })).data;
      // result.items may be loosely typed from the API client; narrow to any[] so
      // we can perform runtime checks safely without TypeScript complaining.
      const rawItems = (result.items || []) as any[];
      const items = rawItems.filter((it) => it && it.username && !it.is_system);

      debugLog('Fetched user options', { count: items.length, sample: items.slice(0, 5) });

      const suggestionSet = new Set<string>();
      const m: Record<string, string> = {};
      const idName: Record<string, string> = {};

      for (const it of items) {
        if (!it || typeof it.id === 'undefined') continue;

        // Normalize id to UUID string form; skip items without normalized ids
        const idValue = normalizeEntityId(it.id);
        if (!idValue) continue;
        const username = it.username ? String(it.username) : '';
        const displayName = it.display_name ? String(it.display_name) : '';

        if (displayName) {
          suggestionSet.add(displayName);
          m[displayName] = idValue;
          m[displayName.toLowerCase()] = idValue;
        }

        if (username) {
          suggestionSet.add(username);
          m[username] = idValue;
          m[username.toLowerCase()] = idValue;
        }

        idName[idValue] = displayName || username;
      }

      setUserPartnerOptions(Array.from(suggestionSet));
      setUserPartnerMap(m);
      setUserIdNameMap(idName);

      debugLog('Processed user suggestions', {
        suggestionCount: suggestionSet.size,
        mapKeys: Object.keys(m).length,
        idLookupKeys: Object.keys(idName).length,
      });
    } catch (e) {
      console.warn('Failed to fetch user options:', e);
    }
  }, []);

  return { userPartnerOptions, userPartnerMap, userIdNameMap, refreshUserOptions };
}
