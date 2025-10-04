import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

import AlterFormFields, { type RelationshipOption } from './AlterForm';
import { apiClient, type Alter, type AlterName } from '@didhub/api-client';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveOwnerId } from '../utils/owner';

function debugLog(...args: unknown[]) {
  console.debug('[AlterFormDialog]', ...args);
}

function formatAlterDisplayName(item: Pick<AlterName, 'id' | 'name' | 'username'>): string {
  const idPart = typeof item.id !== 'undefined' ? `#${item.id}` : '';
  const baseName = (item.name ?? '').trim();
  const username = (item.username ?? '').trim();
  const segments: string[] = [];
  if (baseName) segments.push(baseName);
  if (username) segments.push(`(@${username})`);
  if (!segments.length) {
    return idPart ? `Alter ${idPart}` : 'Alter';
  }
  if (idPart) segments.push(idPart);
  return segments.join(' ');
}

function collectRelationshipIds(source: unknown): Array<number | string> {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .map((item) => {
        if (item == null) return null;
        if (typeof item === 'number') return item;
        if (typeof item === 'string') {
          const trimmed = item.trim();
          if (!trimmed) return null;
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) return collectRelationshipIds(parsed as unknown[]);
            } catch (e) {
              return trimmed;
            }
          }
          return trimmed;
        }
        return null;
      })
      .flat()
      .filter((value): value is number | string => value !== null && value !== '');
  }
  if (typeof source === 'number') return [source];
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return collectRelationshipIds(parsed as unknown[]);
      } catch (e) {
        // fall through to comma split
      }
    }
    return trimmed
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  return [];
}

function extractNumericIds(items: unknown[], aliasMap?: Record<string, number | string>): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const item of items) {
    let candidate: unknown = item;
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const mapped = aliasMap?.[trimmed] ?? aliasMap?.[trimmed.toLowerCase()];
      if (typeof mapped !== 'undefined') {
        candidate = mapped;
      }
      const numeric = Number(String(candidate).trim().replace(/^#/u, ''));
      if (!Number.isFinite(numeric)) continue;
      candidate = numeric;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const id = candidate;
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }
  return result;
}

interface RelationshipSources {
  partners?: unknown;
  parents?: unknown;
  children?: unknown;
}

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
            .map((alter) => {
              const numericId = typeof alter.id === 'number' ? alter.id : Number(alter.id);
              return {
                id: Number.isNaN(numericId) ? (alter.id as number) : numericId,
                name: alter.name ?? '',
                username:
                  typeof (alter as { username?: unknown }).username === 'string'
                    ? String((alter as { username?: unknown }).username)
                    : undefined,
                user_id:
                  typeof (alter as { user_id?: unknown }).user_id === 'number'
                    ? Number((alter as { user_id?: number }).user_id)
                    : null,
              } as AlterName;
            });
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
        return [] as AlterName[];
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

export function useUserRelationshipOptions() {
  const [userPartnerOptions, setUserPartnerOptions] = useState<string[]>([]);
  const [userPartnerMap, setUserPartnerMap] = useState<Record<string, number | string>>({});
  const [userIdNameMap, setUserIdNameMap] = useState<Record<string, string>>({});

  const refreshUserOptions = useCallback(async () => {
    try {
      const result = await apiClient.users.list({ perPage: 200 });
      const items = (result.items || []).filter((it) => it && it.username && !it.is_system);
      debugLog('Fetched user options', { count: items.length, sample: items.slice(0, 5) });
      const suggestionSet = new Set<string>();
      const m: Record<string, number | string> = {};
      const idName: Record<string, string> = {};
      for (const it of items) {
        if (!it || typeof it.id === 'undefined') continue;
        const idValue = it.id as number | string;
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
        idName[String(idValue)] = displayName || username;
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

export interface AlterFormDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onSaved?: () => void;
  id?: string | number;
  routeUid?: string | number | null;
}

const empty: Alter = {
  name: '',
  description: '',
  age: '',
  gender: '',
  pronouns: '',
  birthday: '',
  sexuality: '',
  species: '',
  alter_type: '',
  job: '',
  weapon: '',
  soul_songs: [],
  interests: [],
  triggers: '',
  notes: '',
  affiliations: [],
  subsystem: null,
  group: null,
  system_roles: [],
  is_system_host: false,
  is_dormant: false,
  is_merged: false,
};

type RelationshipType = 'partner' | 'parent' | 'child';

interface RelationshipEntry {
  userId: number;
  type: RelationshipType;
}

function isRelationshipType(value: unknown): value is RelationshipType {
  return value === 'partner' || value === 'parent' || value === 'child';
}

function normalizeAffiliationIds(source: unknown): number[] | null {
  if (source == null) return null;

  const rawItems: unknown[] = (() => {
    if (Array.isArray(source)) return source;
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed as unknown[];
        } catch {
          // fall through to comma split
        }
      }
      return trimmed
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
    if (typeof source === 'number') return [source];
    return null;
  })();

  if (!rawItems) return null;

  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const item of rawItems) {
    let candidate: number | null = null;
    if (typeof item === 'number' && Number.isFinite(item)) {
      candidate = item;
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const numeric = Number(trimmed.replace(/^#/u, ''));
      if (Number.isFinite(numeric)) candidate = numeric;
    } else if (typeof item === 'object' && item !== null) {
      const obj = item as { id?: unknown };
      if (typeof obj.id === 'number' && Number.isFinite(obj.id)) {
        candidate = obj.id;
      } else if (typeof obj.id === 'string') {
        const trimmed = obj.id.trim();
        if (trimmed) {
          const numeric = Number(trimmed.replace(/^#/u, ''));
          if (Number.isFinite(numeric)) candidate = numeric;
        }
      }
    }

    if (candidate != null && !seen.has(candidate)) {
      seen.add(candidate);
      normalized.push(candidate);
    }
  }

  return normalized;
}

export default function AlterFormDialog(props: AlterFormDialogProps) {
  const { mode, open, onClose, onCreated, onSaved, id } = props;

  const [values, setValues] = useState<Partial<Alter> & { _files?: File[] }>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<boolean>(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [originalUserRelationships, setOriginalUserRelationships] = useState<any[]>([]);

  const relationshipValues = useMemo(
    () => ({
      partners: values.partners,
      parents: values.parents,
      children: values.children,
    }),
    [values.partners, values.parents, values.children],
  );

  const { partnerOptions, partnerMap, alterIdNameMap, refreshPartnerOptions } =
    useAlterRelationshipOptions(relationshipValues);

  const { userPartnerOptions, userPartnerMap, userIdNameMap, refreshUserOptions } = useUserRelationshipOptions();

  function extractFieldErrors(error: unknown): Record<string, string> | undefined {
    if (typeof error === 'object' && error !== null) {
      const maybeData = (error as { data?: unknown }).data;
      if (maybeData && typeof maybeData === 'object') {
        if ('errors' in maybeData && typeof (maybeData as { errors?: unknown }).errors === 'object') {
          return (maybeData as { errors?: Record<string, string> }).errors;
        }
        if ('error' in maybeData && typeof (maybeData as { error?: unknown }).error === 'string') {
          return { general: (maybeData as { error?: string }).error ?? 'Request failed' };
        }
      }
    }
    if (error instanceof Error && error.message) {
      return { general: error.message };
    }
    return undefined;
  }

  function resolveUserId(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const fromMap = userPartnerMap[trimmed] ?? userPartnerMap[trimmed.toLowerCase()];
      if (typeof fromMap !== 'undefined') {
        const numeric = Number(fromMap);
        return Number.isNaN(numeric) ? undefined : numeric;
      }
      const numeric = Number(trimmed);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
  }

  function buildRelationshipEntries(source: unknown, type: RelationshipType): RelationshipEntry[] {
    if (!Array.isArray(source)) return [];
    return source
      .map((value) => resolveUserId(value))
      .filter((id): id is number => typeof id === 'number')
      .map((userId) => ({ userId, type }));
  }

  // Only fetch partner/user options when the dialog is actually open.
  useEffect(() => {
    if (!open) return;
    debugLog('Dialog opened; fetching options');
    void refreshPartnerOptions(undefined, { forceReload: true });
    void refreshUserOptions();
  }, [open, refreshPartnerOptions, refreshUserOptions]);

  const load = useCallback(async () => {
    if (mode !== 'edit' || !id) return;
    debugLog('Loading alter for edit', { id });
    const r = await apiClient.alters.get(id);
    if (r) {
      // Store original user relationships for comparison
      const userRelationships = r.user_relationships || [];
      setOriginalUserRelationships(userRelationships);
      debugLog('Loaded alter data', {
        partners: r.partners,
        parents: r.parents,
        children: r.children,
        userRelationships,
      });

      // Transform user_relationships into form fields
      const user_partners = userRelationships
        .filter((rel) => rel.relationship_type === 'partner')
        .map((rel) => rel.user_id);
      const user_parents = userRelationships
        .filter((rel) => rel.relationship_type === 'parent')
        .map((rel) => rel.user_id);
      const user_children = userRelationships
        .filter((rel) => rel.relationship_type === 'child')
        .map((rel) => rel.user_id);

      const affiliationIds = normalizeAffiliationIds(r.affiliations) ?? [];

      setValues({
        ...r,
        affiliations: affiliationIds,
        user_partners,
        user_parents,
        user_children,
      });
      debugLog('Prepared form values after load', {
        user_partners,
        user_parents,
        user_children,
      });
      await refreshPartnerOptions(r);
    } else {
      setValues(empty);
      setOriginalUserRelationships([]);
    }
    setErrors({});
  }, [id, mode, refreshPartnerOptions]);

  useEffect(() => {
    if (mode === 'edit' && open && id) {
      void load();
    } else if (mode === 'create' && open) {
      setValues(empty);
      setErrors({});
      setOriginalUserRelationships([]);
    }
  }, [mode, open, id, load]);

  async function updateUserRelationships(alterId: number) {
    // Get desired relationships from form values
    const desiredRelationships: RelationshipEntry[] = [
      ...buildRelationshipEntries(values.user_partners, 'partner'),
      ...buildRelationshipEntries(values.user_parents, 'parent'),
      ...buildRelationshipEntries(values.user_children, 'child'),
    ];

    // Get current relationships
    const currentRelationships: RelationshipEntry[] = (
      Array.isArray(originalUserRelationships) ? originalUserRelationships : []
    )
      .map((rel) => ({
        userId: resolveUserId(rel?.user_id),
        type: rel?.relationship_type,
      }))
      .filter((rel): rel is RelationshipEntry => typeof rel.userId === 'number' && isRelationshipType(rel.type))
      .map((rel) => ({ userId: rel.userId, type: rel.type }));

    // Find relationships to add and remove
    const toAdd = desiredRelationships.filter(
      (desired) =>
        !currentRelationships.some((current) => current.userId === desired.userId && current.type === desired.type),
    );

    const toRemove = currentRelationships.filter(
      (current) =>
        !desiredRelationships.some((desired) => desired.userId === current.userId && desired.type === current.type),
    );

    // Remove old relationships
    for (const rel of toRemove) {
      try {
        console.log('Removing user relationship:', rel);
        await apiClient.alters.removeRelationship(alterId, rel.userId, rel.type);
        console.log('Successfully removed user relationship:', rel);
      } catch (e) {
        console.warn('Failed to remove user relationship:', e);
        // Continue with other operations
      }
    }

    // Add new relationships
    for (const rel of toAdd) {
      try {
        console.log('Adding user relationship:', rel);
        await apiClient.alters.addRelationship(alterId, rel.userId, rel.type);
        console.log('Successfully added user relationship:', rel);
      } catch (e) {
        console.warn('Failed to add user relationship:', e);
        // Continue with other operations
      }
    }
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrors({});
    if (!values.name || !values.name.trim()) {
      setErrors({ name: 'Name required' });
      return;
    }
    if (values.name && values.name.length > 200) {
      setErrors({ name: 'Name too long' });
      return;
    }

    const payload: Record<string, unknown> = { ...values };
    if (typeof payload.soul_songs === 'string' && payload.soul_songs)
      (payload as any).soul_songs = (payload.soul_songs as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (payload.interests && typeof payload.interests === 'string')
      (payload as any).interests = (payload.interests as string)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    if (typeof payload.system_roles === 'string' && payload.system_roles)
      (payload as any).system_roles = (payload.system_roles as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    // Remove JSON.stringify for arrays, let fetch handle it
    payload.is_system_host = !!payload.is_system_host;
    payload.is_dormant = !!payload.is_dormant;
    payload.is_merged = !!payload.is_merged;
    const normalizedAffiliations = normalizeAffiliationIds((payload as { affiliations?: unknown }).affiliations);
    if (normalizedAffiliations !== null) {
      (payload as any).affiliations = normalizedAffiliations;
    }
    // Normalize partners: accept `partner` or `partners` (string or array)
    // Normalize partners: ensure `partners` is an array of non-empty trimmed strings
    if (Array.isArray((payload as any).partners)) {
      (payload as any).partners = (payload as any).partners
        .map((p: any) => (typeof p === 'string' ? p.trim() : p))
        .filter(Boolean);
      if (!(payload as any).partners.length) delete (payload as any).partners;
    } else if (payload.partners && typeof payload.partners === 'string') {
      (payload as any).partners = (payload.partners as string)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (!(payload as any).partners.length) delete (payload as any).partners;
    }
    if (Array.isArray((payload as any).partners)) {
      const normalizedPartners = extractNumericIds((payload as any).partners, partnerMap);
      if (normalizedPartners.length) (payload as any).partners = normalizedPartners;
      else delete (payload as any).partners;
    }
    if (Array.isArray((payload as any).parents)) {
      const normalizedParents = extractNumericIds((payload as any).parents, partnerMap);
      if (normalizedParents.length) (payload as any).parents = normalizedParents;
      else delete (payload as any).parents;
    }
    if (Array.isArray((payload as any).children)) {
      const normalizedChildren = extractNumericIds((payload as any).children, partnerMap);
      if (normalizedChildren.length) (payload as any).children = normalizedChildren;
      else delete (payload as any).children;
    }
    if (values._files && values._files.length) {
      setUploading(true);
      const urls: string[] = [];
      for (const f of values._files) {
        setProgressMap((pm) => ({ ...pm, [f.name]: 0 }));
        const r = await apiClient.files.uploadWithProgress(f, (pct: number) => {
          setProgressMap((pm) => ({ ...pm, [f.name]: pct }));
        });
        if (r && r.url) urls.push(r.url as string);
      }
      setUploading(false);
      if (urls.length)
        payload.images = urls; // initial order = upload order; first image is primary
      else {
        setErrors({ file: 'upload failed' });
        return;
      }
    }

    delete (payload as any)._files;

    if (mode === 'create') {
      const auth = useAuth();
      try {
        // include explicit owner_user_id when creating on behalf of a system route
        const owner = getEffectiveOwnerId(
          props.routeUid == null ? undefined : String(props.routeUid),
          auth.user?.id ?? null,
        );
        if (typeof owner === 'number') (payload as any).owner_user_id = owner;
        const created = await apiClient.alters.create(payload);
        debugLog('Alter creation response', created);
        const alterId = created?.id ? Number(created.id) : undefined;
        console.log('Alter created with ID:', alterId);
        console.log('User partners:', values.user_partners);
        console.log('User parents:', values.user_parents);
        console.log('User children:', values.user_children);

        if (alterId) {
          const userRelationships: RelationshipEntry[] = [
            ...buildRelationshipEntries(values.user_partners, 'partner'),
            ...buildRelationshipEntries(values.user_parents, 'parent'),
            ...buildRelationshipEntries(values.user_children, 'child'),
          ];
          console.log('User relationships to create:', userRelationships);

          for (const rel of userRelationships) {
            try {
              console.log('Creating relationship:', rel);
              await apiClient.alters.addRelationship(alterId, rel.userId, rel.type);
              console.log('Relationship creation result:', rel);
            } catch (e) {
              console.warn('Failed to create user relationship:', e);
              // Don't fail the whole creation for relationship errors
            }
          }
        }

        setValues(empty);
        onCreated && onCreated();
        onClose();
      } catch (err) {
        console.error('Failed to create alter', err);
        const fieldErrors = extractFieldErrors(err);
        if (fieldErrors) setErrors(fieldErrors);
        else setErrors({ general: 'Failed to create alter' });
      }
    } else if (mode === 'edit') {
      // For edit
      const editPayload: Partial<Alter> & Record<string, unknown> = { ...payload };
      // Remove fields that non-admins cannot modify
      delete editPayload.owner_user_id;
      delete editPayload.created_at;
      delete editPayload.user_relationships;
      // Normalize subsystem: if an object slipped in, reduce to its id or name
      if (editPayload && (editPayload as any).subsystem && typeof (editPayload as any).subsystem === 'object') {
        const sub = (editPayload as any).subsystem as any;
        if (sub && typeof sub.id !== 'undefined') (editPayload as any).subsystem = sub.id;
        else if (sub && sub.name) (editPayload as any).subsystem = sub.name;
        else delete (editPayload as any).subsystem;
      }
      // Ensure partners normalization: KEEP empty array (signals removal of all partners)
      if (Array.isArray((editPayload as any).partners)) {
        (editPayload as any).partners = (editPayload as any).partners
          .map((p: any) => (typeof p === 'string' ? p.trim() : p))
          .filter((v: any) => v !== '' && v != null);
        // Do NOT delete when length === 0; backend interprets [] as clear all
      } else if (typeof (editPayload as any).partners === 'string') {
        (editPayload as any).partners = (editPayload as any).partners
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
        // Keep empty array if user removed all
      }
      if (Array.isArray((editPayload as any).partners)) {
        (editPayload as any).partners = extractNumericIds((editPayload as any).partners, partnerMap);
      }
      if (Array.isArray((editPayload as any).parents)) {
        (editPayload as any).parents = extractNumericIds((editPayload as any).parents, partnerMap);
      }
      if (Array.isArray((editPayload as any).children)) {
        (editPayload as any).children = extractNumericIds((editPayload as any).children, partnerMap);
      }
      if (values._files && values._files.length) {
        const urls: string[] = [];
        for (const f of values._files) {
          setProgressMap((pm) => ({ ...pm, [f.name]: 0 }));
          const ur = await apiClient.files.uploadWithProgress(f, (pct: number) => {
            setProgressMap((pm) => ({ ...pm, [f.name]: pct }));
          });
          if (ur && ur.url) urls.push(ur.url as string);
        }
        if (urls.length) {
          const existingImages = Array.isArray(values.images) ? values.images : [];
          editPayload.images = [...existingImages, ...urls];
        } else {
          setErrors({ file: 'upload failed' });
          return;
        }
      }
      try {
        await apiClient.alters.update(id, editPayload);
        debugLog('Alter update payload sent', editPayload);
        // Update user relationships
        await updateUserRelationships(Number(id));

        onSaved && onSaved();
        onClose();
      } catch (err) {
        console.error('Failed to update alter', err);
        const fieldErrors = extractFieldErrors(err);
        if (fieldErrors) setErrors(fieldErrors);
        else setErrors({ general: 'Save failed' });
      }
    }
  }

  function change(k: string, v: unknown) {
    setValues((prev) => ({ ...(prev as object), [k]: v }) as Partial<Alter> & { _files?: File[] });
  }

  function onFile(f: File[]) {
    setValues({ ...values, _files: f });
  }

  function removePending(idx: number) {
    setValues((prev) => ({ ...(prev as any), _files: (prev._files || []).filter((_, i) => i !== idx) }));
  }

  async function handleDeleteImage(url: string) {
    if (mode !== 'edit' || !id) return;
    try {
      const r = await apiClient.alters.removeImage(id, url);
      const images = (r as any)?.json?.images ?? (r as any)?.images;
      if (Array.isArray(images)) {
        setValues((prev) => ({ ...(prev as any), images }));
      } else {
        // fallback local removal
        setValues((prev) => {
          const existing = Array.isArray(prev.images) ? prev.images : prev.images ? [String(prev.images)] : [];
          return { ...(prev as any), images: existing.filter((u: string) => u !== url) } as any;
        });
      }
    } catch (e) {
      // ignore for now; UI remains unchanged
    }
  }

  function reorderImages(from: number, to: number) {
    setValues((prev) => {
      const imgs = Array.isArray(prev.images) ? [...prev.images] : [];
      if (from < 0 || from >= imgs.length || to < 0 || to >= imgs.length) return prev;
      const [moved] = imgs.splice(from, 1);
      imgs.splice(to, 0, moved);
      return { ...(prev as any), images: imgs };
    });
  }

  const title = mode === 'create' ? 'Create Alter' : 'Edit Alter';
  const submitLabel = mode === 'create' ? 'Create' : 'Save';

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <AlterFormFields
          values={values}
          errors={errors}
          partnerOptions={partnerOptions}
          partnerMap={partnerMap}
          parentOptions={partnerOptions}
          parentMap={partnerMap}
          childOptions={partnerOptions}
          childMap={partnerMap}
          userPartnerOptions={userPartnerOptions}
          userPartnerMap={userPartnerMap}
          userParentOptions={userPartnerOptions}
          userParentMap={userPartnerMap}
          userChildOptions={userPartnerOptions}
          userChildMap={userPartnerMap}
          alterIdNameMap={alterIdNameMap}
          userIdNameMap={userIdNameMap}
          onChange={change}
          onFile={onFile}
          onRemovePendingFile={removePending}
          onDeleteImage={mode === 'edit' ? handleDeleteImage : undefined}
          onReorderImages={reorderImages}
          routeUid={props.routeUid}
          progressMap={progressMap}
          uploading={uploading}
          showDescription={mode === 'edit'}
          partnerLabel={mode === 'edit' ? 'Partner(s)' : 'Partners'}
          useSwitchForHost={mode === 'create'}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
