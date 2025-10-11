import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@didhub/api-client';
import {
  formatAlterDisplayName,
  collectRelationshipIds,
  type RelationshipOption,
  type RelationshipSources,
  normalizeEntityId,
} from '../utils/alterFormUtils';

function debugLog(...args: unknown[]) {
  console.debug('[AlterRelationships]', ...args);
}

/**
 * Hook for managing alter relationship options and mappings
 */
export function useAlterRelationshipOptions(relationships: RelationshipSources) {
  const [partnerOptions, setPartnerOptions] = useState<RelationshipOption[]>([]);
  const [partnerMap, setPartnerMap] = useState<Record<string, string>>({});
  const [alterIdNameMap, setAlterIdNameMap] = useState<Record<string, string>>({});

  const relationshipsRef = useRef<RelationshipSources>({
    partners: relationships.partners,
    parents: relationships.parents,
    children: relationships.children,
  });

  const namesCacheRef = useRef<any[] | null>(null);
  const namesFetchRef = useRef<Promise<any[]> | null>(null);
  const lastNamesFetchRef = useRef<number>(0);

  useEffect(() => {
    relationshipsRef.current = {
      partners: relationships.partners,
      parents: relationships.parents,
      children: relationships.children,
    };
  }, [relationships.partners, relationships.parents, relationships.children]);

  const loadAlterNameCandidates = useCallback(async (forceReload = false): Promise<any[]> => {
    const now = Date.now();
    const cacheAge = now - lastNamesFetchRef.current;

    if (!forceReload && namesCacheRef.current && cacheAge < 60_000) {
      return namesCacheRef.current;
    }

    if (!forceReload && namesFetchRef.current) {
      return namesFetchRef.current;
    }

    const fetchPromise = (async () => {
      let items = (await apiClient.alter.get_alters_names()).data;
      if (!Array.isArray(items)) {
        debugLog('Alter names endpoint returned non-array payload, normalizing to empty array', items);
        items = [];
      }

      if (!items.length) {
        debugLog('Alter names endpoint returned empty; falling back to alters.list');
        try {
          const listPage = await apiClient.alter.get_alters({ perPage: 1000 });
          items = listPage.data.items
            .filter((alter) => Boolean(alter) && typeof (alter as any).id !== 'undefined')
            .map((alter) => ({
              id: (alter as any).id,
              name: (alter as any).name ?? '',
              username: (alter as any).username ?? undefined,
              user_id: (alter as any).user_id ?? null,
            }));
          debugLog('Fallback alters.list loaded', { count: items.length, sample: items.slice(0, 5) });
        } catch (fallbackError) {
          debugLog('Fallback alters.list failed', fallbackError);
        }
      }
      const filtered = items.filter((it) => Boolean(it) && typeof (it as any).id !== 'undefined');
      lastNamesFetchRef.current = Date.now();
      namesCacheRef.current = filtered;
      return filtered;
    })()
      .catch((error) => {
        debugLog('Failed to load alter name candidates', error);
        return [];
      })
      .finally(() => {
        namesFetchRef.current = null;
      });

    namesFetchRef.current = fetchPromise;
    return fetchPromise;
  }, []);

  const refreshPartnerOptions = useCallback(
    async (existingAlter?: any | null, opts?: { forceReload?: boolean }) => {
      try {
        const baseItems = await loadAlterNameCandidates(opts?.forceReload ?? false);
        debugLog('Fetched alter names', { count: baseItems.length, sample: baseItems.slice(0, 5) });

        const optionsList: RelationshipOption[] = [];
        const aliasMap: Record<string, string> = {};
        const idName: Record<string, string> = {};
        const optionById = new Map<string, RelationshipOption>();

        const register = (alias: string | null | undefined, idValue: string, collector: Set<string>) => {
          if (alias == null) return;
          const text = String(alias).trim();
          if (!text) return;
          const n = normalizeEntityId(idValue);
          if (!n) return;
          aliasMap[text] = n;
          aliasMap[text.toLowerCase()] = n;
          collector.add(text.toLowerCase());
        };

        const addOption = (option: RelationshipOption) => {
          optionsList.push(option);
          const optId = normalizeEntityId(option.id);
          if (optId) optionById.set(optId, option);
        };

        const ensureOptionForId = async (identifier: string) => {
          const idValue = (normalizeEntityId(identifier) ?? '').trim().replace(/^#/u, '');
          if (!idValue) return;
          if (aliasMap[idValue] || aliasMap[idValue.toLowerCase()]) return;

          try {
            const fetched = (await apiClient.alter.get_alters_by_id(idValue)).data;
            if (fetched && typeof fetched.id !== 'undefined') {
              const display = formatAlterDisplayName({
                id: fetched.id,
                name: fetched.name ?? undefined,
                username: (fetched as { username?: string }).username,
              });
              const aliases = new Set<string>();
              const fetchedId = normalizeEntityId(fetched.id);
              register(display, fetchedId, aliases);
              register(fetched.name, fetchedId, aliases);
              register((fetched as { username?: string }).username, fetchedId, aliases);
              const option = { id: fetchedId, label: display, aliases: Array.from(aliases) };
              addOption(option);
              idName[fetchedId] = display;
              return;
            }
          } catch (fetchErr) {
            debugLog('Failed to fetch alter for relationship option', { id: identifier, error: fetchErr });
          }

          const fallbackLabel = `Alter #${idValue}`;
          const aliases = new Set<string>();
          register(fallbackLabel, idValue, aliases);
          const option = { id: idValue, label: fallbackLabel, aliases: Array.from(aliases) };
          addOption(option);
          idName[idValue] = fallbackLabel;
        };

        // Process base items
        for (const it of baseItems) {
          const idValue = normalizeEntityId(it.id) ?? undefined;
          const display = formatAlterDisplayName({
            id: it.id,
            name: it.name ?? undefined,
            username: (it as { username?: string }).username,
          });
          const aliases = new Set<string>();
          register(display, idValue, aliases);
          register(it.name, idValue, aliases);
          register(it.username ? `@${it.username}` : null, idValue, aliases);
          register(it.username, idValue, aliases);
          register(idValue, idValue, aliases);
          register(`#${idValue}`, idValue, aliases);
          addOption({ id: idValue, label: display, aliases: Array.from(aliases) });
          idName[idValue] = display;
        }

        const {
          partners: currentPartners,
          parents: currentParents,
          children: currentChildren,
        } = relationshipsRef.current;

        const relationshipSources = [currentPartners, currentParents, currentChildren];
        if (existingAlter) {
          relationshipSources.push(existingAlter.partners, existingAlter.parents, existingAlter.children);
        }

        const ensureIds = new Set<string>();
        relationshipSources.forEach((source) => {
          collectRelationshipIds(source).forEach((identifier) => {
            const ensured = normalizeEntityId(identifier);
            if (ensured) ensureIds.add(ensured);
          });
        });

        for (const identifier of ensureIds) {
          if (optionById.has(identifier)) continue;
          await ensureOptionForId(identifier);
        }

        optionsList.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        setPartnerOptions(optionsList);
        setPartnerMap(aliasMap);
        setAlterIdNameMap(idName);

        debugLog('Processed partner options', {
          optionCount: optionsList.length,
          aliasKeys: Object.keys(aliasMap).length,
          idLookupKeys: Object.keys(idName).length,
          example: optionsList.slice(0, 5),
        });
      } catch (e) {
        debugLog('Failed to fetch partner options', e);
      }
    },
    [loadAlterNameCandidates],
  );

  return { partnerOptions, partnerMap, alterIdNameMap, refreshPartnerOptions };
}
