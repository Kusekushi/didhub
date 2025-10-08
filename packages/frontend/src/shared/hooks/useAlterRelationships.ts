import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, type Alter, type AlterName } from '@didhub/api-client';
import {
  formatAlterDisplayName,
  collectRelationshipIds,
  type RelationshipOption,
  type RelationshipSources,
} from '../utils/alterFormUtils';

function debugLog(...args: unknown[]) {
  console.debug('[AlterRelationships]', ...args);
}

/**
 * Hook for managing alter relationship options and mappings
 */
export function useAlterRelationshipOptions(relationships: RelationshipSources) {
  const [partnerOptions, setPartnerOptions] = useState<RelationshipOption[]>([]);
  const [partnerMap, setPartnerMap] = useState<Record<string, number | string>>({});
  const [alterIdNameMap, setAlterIdNameMap] = useState<Record<string, string>>({});

  const relationshipsRef = useRef<RelationshipSources>({
    partners: relationships.partners,
    parents: relationships.parents,
    children: relationships.children,
  });

  const namesCacheRef = useRef<AlterName[] | null>(null);
  const namesFetchRef = useRef<Promise<AlterName[]> | null>(null);
  const lastNamesFetchRef = useRef<number>(0);

  useEffect(() => {
    relationshipsRef.current = {
      partners: relationships.partners,
      parents: relationships.parents,
      children: relationships.children,
    };
  }, [relationships.partners, relationships.parents, relationships.children]);

  const loadAlterNameCandidates = useCallback(async (forceReload = false): Promise<AlterName[]> => {
    const now = Date.now();
    const cacheAge = now - lastNamesFetchRef.current;

    if (!forceReload && namesCacheRef.current && cacheAge < 60_000) {
      return namesCacheRef.current;
    }

    if (!forceReload && namesFetchRef.current) {
      return namesFetchRef.current;
    }

    const fetchPromise = (async () => {
      let items = await apiClient.alters.names();
      if (!Array.isArray(items)) {
        debugLog('Alter names endpoint returned non-array payload, normalizing to empty array', items);
        items = [];
      }

      if (!items.length) {
        debugLog('Alter names endpoint returned empty; falling back to alters.list');
        try {
          const listPage = await apiClient.alters.list({ perPage: 1000 });
          items = listPage.items
            .filter((alter): alter is Alter => Boolean(alter) && typeof alter.id !== 'undefined')
            .map((alter) => ({
              id: typeof alter.id === 'number' ? alter.id : Number(alter.id),
              name: alter.name ?? '',
              username: (alter as { username?: string }).username ?? undefined,
              user_id: (alter as { user_id?: number }).user_id ?? null,
            }));
          debugLog('Fallback alters.list loaded', { count: items.length, sample: items.slice(0, 5) });
        } catch (fallbackError) {
          debugLog('Fallback alters.list failed', fallbackError);
        }
      }

      const filtered = items.filter((it): it is AlterName => Boolean(it) && typeof it.id !== 'undefined');
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
    async (existingAlter?: Alter | null, opts?: { forceReload?: boolean }) => {
      try {
        const baseItems = await loadAlterNameCandidates(opts?.forceReload ?? false);
        debugLog('Fetched alter names', { count: baseItems.length, sample: baseItems.slice(0, 5) });

        const optionsList: RelationshipOption[] = [];
        const aliasMap: Record<string, number | string> = {};
        const idName: Record<string, string> = {};
        const optionById = new Map<string, RelationshipOption>();

        const register = (
          alias: string | number | null | undefined,
          idValue: number | string,
          collector: Set<string>,
        ) => {
          if (alias == null) return;
          const text = String(alias).trim();
          if (!text) return;
          aliasMap[text] = idValue;
          aliasMap[text.toLowerCase()] = idValue;
          collector.add(text.toLowerCase());
        };

        const addOption = (option: RelationshipOption) => {
          optionsList.push(option);
          optionById.set(String(option.id), option);
        };

        const ensureOptionForId = async (identifier: number | string) => {
          const idValue = identifier as number | string;
          if (aliasMap[String(idValue)] || aliasMap[String(idValue).toLowerCase()]) return;

          try {
            const fetched = await apiClient.alters.get(idValue);
            if (fetched && typeof fetched.id !== 'undefined') {
              const display = formatAlterDisplayName({
                id: fetched.id as number,
                name: fetched.name ?? undefined,
                username: (fetched as { username?: string }).username,
              });
              const aliases = new Set<string>();
              register(display, fetched.id as number | string, aliases);
              register(fetched.name, fetched.id as number | string, aliases);
              register((fetched as { username?: string }).username, fetched.id as number | string, aliases);
              const option = { id: fetched.id as number | string, label: display, aliases: Array.from(aliases) };
              addOption(option);
              idName[String(fetched.id)] = display;
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
          idName[String(idValue)] = fallbackLabel;
        };

        // Process base items
        for (const it of baseItems) {
          const idValue = it.id as number | string;
          const display = formatAlterDisplayName(it);
          idName[String(idValue)] = display;
          const aliases = new Set<string>();
          register(display, idValue, aliases);
          register(it.name, idValue, aliases);
          register(it.username ? `@${it.username}` : null, idValue, aliases);
          register(it.username, idValue, aliases);
          register(idValue, idValue, aliases);
          register(`#${idValue}`, idValue, aliases);
          addOption({ id: idValue, label: display, aliases: Array.from(aliases) });
        }

        // Ensure options for existing relationships
        const {
          partners: currentPartners,
          parents: currentParents,
          children: currentChildren,
        } = relationshipsRef.current;

        const relationshipSources = [currentPartners, currentParents, currentChildren];
        if (existingAlter) {
          relationshipSources.push(
            existingAlter.partners,
            existingAlter.parents,
            existingAlter.children,
          );
        }

        const ensureIds = new Set<string>();
        relationshipSources.forEach((source) => {
          collectRelationshipIds(source).forEach((identifier) => {
            ensureIds.add(String(identifier));
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