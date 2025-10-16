import { useState, useCallback, useEffect } from 'react';
import uniq from 'lodash-es/uniq';
import * as alterService from '../../services/alterService';
import * as relationshipService from '../../services/relationshipService';
import * as fileService from '../../services/fileService';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveOwnerId } from '../utils/owner';
import {
  extractNumericIds,
  collectRelationshipIds,
  normalizeAffiliationIds,
  processArrayField,
  extractFieldErrors,
  normalizeEntityId,
  type EntityId,
} from '../utils/alterFormUtils';

export interface AlterFormDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  onCreated?: () => Promise<void> | void;
  onSaved?: () => Promise<void> | void;
  id?: EntityId;
  routeUid?: EntityId | null;
}

interface AlterFormState {
  name?: string;
  images?: unknown;
  user_relationships?: Array<Record<string, unknown>> | null;
  affiliations?: unknown;
  subsystem?: unknown;
  soul_songs?: unknown;
  interests?: unknown;
  system_roles?: unknown;
  partners?: unknown;
  parents?: unknown;
  children?: unknown;
  user_partners?: unknown;
  user_parents?: unknown;
  user_children?: unknown;
  [key: string]: unknown;
}

export interface RelationshipEntry {
  userId: string;
  type: RelationshipType;
}

export type RelationshipType = 'partner' | 'parent' | 'child';

const emptyAlter: AlterFormState = {
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
  interests: '',
  triggers: '',
  notes: '',
  affiliations: [],
  subsystem: null,
  system_roles: [],
  is_system_host: 0,
  is_dormant: 0,
  is_merged: 0,
};

/**
 * Hook for managing alter form state and operations
 */
export function useAlterForm(props: AlterFormDialogProps) {
  const { mode, open, onClose, onCreated, onSaved, id, routeUid } = props;

  const [values, setValues] = useState<AlterFormState & { _files?: File[] }>(emptyAlter);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<boolean>(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});

  const auth = useAuth();

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setValues(emptyAlter);
      setErrors({});
      setProgressMap({});
    }
  }, [open]);

  const loadAlter = useCallback(async () => {
    if (mode !== 'edit' || !id) return;

    try {
      const alter = await alterService.getAlterById(id as any);
      if (alter) {
        const userRelationships = Array.isArray((alter as any).user_relationships)
          ? ((alter as any).user_relationships as Array<Record<string, unknown>>)
          : [];

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

        const affiliationIds = normalizeAffiliationIds((alter as any).affiliations) ?? [];

        setValues({
          ...alter,
          affiliations: affiliationIds,
          user_partners,
          user_parents,
          user_children,
        });
      } else {
        setValues(emptyAlter);
      }
    } catch (error) {
      console.error('Failed to load alter:', error);
      setValues(emptyAlter);
    }
  }, [id, mode]);

  // Load alter data when editing
  useEffect(() => {
    if (mode === 'edit' && open && id) {
      loadAlter();
    } else if (mode === 'create' && open) {
      setValues(emptyAlter);
      setErrors({});
    }
  }, [mode, open, id, loadAlter]);

  const resolveUserId = useCallback((value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      return trimmed.replace(/^#/u, '');
    }
    // Only accept string IDs or objects with string 'id' fields. Numeric IDs are
    // not supported for entity IDs (they should be UUID strings).
    if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
      const idv = (value as { id?: unknown }).id;
      if (typeof idv === 'string') return idv.trim().replace(/^#/u, '') || undefined;
    }
    return undefined;
  }, []);

  const buildRelationshipEntries = useCallback(
    (source: unknown, type: RelationshipType): RelationshipEntry[] => {
      if (!Array.isArray(source)) return [];
      return source
        .map((value) => resolveUserId(value))
        .filter((id): id is string => typeof id === 'string')
        .map((userId) => ({ userId, type }));
    },
    [resolveUserId],
  );

  const handleFileUpload = useCallback(async (files: File[]): Promise<string[]> => {
    if (!files.length) return [];

    setUploading(true);
    const urls: string[] = [];

    try {
      for (const file of files) {
        setProgressMap((prev) => ({ ...prev, [file.name]: 0 }));

        const url = await fileService.uploadFile(file);
        setProgressMap((prev) => ({ ...prev, [file.name]: 100 }));
        urls.push(url);
      }

      if (!urls.length) {
        throw new Error('upload failed');
      }

      return urls;
    } finally {
      setUploading(false);
    }
  }, []);

  const preparePayload = useCallback(
    (partnerMap: Record<string, string>) => {
      const payload: Record<string, unknown> = { ...values };

      // Process array fields
      if (typeof payload.soul_songs === 'string' && payload.soul_songs) {
        payload.soul_songs = processArrayField(payload.soul_songs);
      }
      // Keep interests as a raw string on the payload. Backend expects a
      // single TEXT field. Do not coerce into an array here.
      if (payload.interests && typeof payload.interests !== 'string') {
          payload.interests = String(payload.interests ?? '');
      }
      if (typeof payload.system_roles === 'string' && payload.system_roles) {
        payload.system_roles = processArrayField(payload.system_roles);
      }

      // Process boolean fields
      payload.is_system_host = !!payload.is_system_host;
      payload.is_dormant = !!payload.is_dormant;
      payload.is_merged = !!payload.is_merged;

      // Normalize affiliations
      const normalizedAffiliations = normalizeAffiliationIds(payload.affiliations);
      if (normalizedAffiliations !== null) {
        payload.affiliations = normalizedAffiliations;
      }

      // Extract relationship IDs
      const partnerIds = extractNumericIds(collectRelationshipIds(values.partners), partnerMap);
      const parentIds = extractNumericIds(collectRelationshipIds(values.parents), partnerMap);
      const childIds = extractNumericIds(collectRelationshipIds(values.children), partnerMap);

      // Build user relationships
      const desiredUserRelationships: RelationshipEntry[] = [
        ...buildRelationshipEntries(values.user_partners, 'partner'),
        ...buildRelationshipEntries(values.user_parents, 'parent'),
        ...buildRelationshipEntries(values.user_children, 'child'),
      ];

      const dedupeByType = (type: RelationshipType): string[] =>
        uniq(desiredUserRelationships.filter((e) => e.type === type).map((e) => e.userId));

      const userRelationshipsPayload = {
        partners: dedupeByType('partner'),
        parents: dedupeByType('parent'),
        children: dedupeByType('child'),
      };

      // Remove form-specific fields from payload
      delete payload.partners;
      delete payload.parents;
      delete payload.children;
      delete payload.user_partners;
      delete payload.user_parents;
      delete payload.user_children;
      delete payload.user_relationships;
      delete payload._files;

      return {
        payload,
        relationships: { partners: partnerIds, parents: parentIds, children: childIds },
        userRelationships: userRelationshipsPayload,
      };
    },
    [values, buildRelationshipEntries],
  );

  const createAlter = useCallback(
    async (partnerMap: Record<string, string>) => {
      const { payload, relationships, userRelationships } = preparePayload(partnerMap);

      // Handle file uploads
      if (values._files && values._files.length) {
        const urls = await handleFileUpload(values._files);
        payload.images = urls;
      }

      // Set owner for new alters (string IDs only)
      const owner = getEffectiveOwnerId(routeUid == null ? undefined : routeUid, auth.user?.id ?? null);
      if (typeof owner === 'string') {
        payload.owner_user_id = owner;
      }

      const created = await alterService.createAlter(payload as any);

      if (created?.id) {
        const alterId = normalizeEntityId((created as any).id);
        // Only set relationships when we have a normalized UUID id
        if (alterId) {
          relationships.partners.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `A:${_otherId}`, b: `A:${alterId}`, relationship_type: "partner", is_past_life: 0 });
          });
          relationships.parents.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `A:${_otherId}`, b: `A:${alterId}`, relationship_type: "parent", is_past_life: 0 });
          });
          relationships.children.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `A:${alterId}`, b: `A:${_otherId}`, relationship_type: "child", is_past_life: 0 });
          });
          userRelationships.partners.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `U:${_otherId}`, b: `A:${alterId}`, relationship_type: "partner", is_past_life: 0 });
          });
          userRelationships.parents.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `U:${_otherId}`, b: `A:${alterId}`, relationship_type: "parent", is_past_life: 0 });
          });
          userRelationships.children.forEach(async (_otherId) => {
            await relationshipService.createRelationship({ a: `A:${alterId}`, b: `U:${_otherId}`, relationship_type: "child", is_past_life: 0 });
          });
        } else {
          // Created alter ID was not a normalized UUID - skip relationship calls
          console.warn('Created alter id is not a normalized UUID, skipping relationship updates', (created as any).id);
        }
      }

      return created;
    },
    [preparePayload, values._files, handleFileUpload, routeUid, auth.user?.id],
  );

  const updateAlter = useCallback(
    async (partnerMap: Record<string, string>) => {
      if (!id) throw new Error('Alter ID required for update');

      const { payload, relationships, userRelationships } = preparePayload(partnerMap);

      // Remove fields that non-admins cannot modify
      delete payload.owner_user_id;
      delete payload.created_at;
      delete payload.user_relationships;

      // Normalize subsystem
      if (payload.subsystem && typeof payload.subsystem === 'object') {
        const sub = payload.subsystem as any;
        if (sub && typeof sub.id !== 'undefined') {
          payload.subsystem = sub.id;
        } else if (sub && sub.name) {
          payload.subsystem = sub.name;
        } else {
          delete payload.subsystem;
        }
      }

      // Handle file uploads for updates
      if (values._files && values._files.length) {
        const urls = await handleFileUpload(values._files);
        const existingImages = Array.isArray(values.images) ? values.images : [];
        payload.images = [...existingImages, ...urls];
      }

      await alterService.updateAlter(id, payload);

      // Normalize the alter id we just updated and load existing relationships
      const alterId = normalizeEntityId(id);
      if (!alterId) return;

      const currentRelationships = (await relationshipService.getRelationships(alterId)) || [];

      // Build a map of current relationship keys -> relationship id for quick lookup.
      // Key format: `${a}|${b}|${type}` where a/b are canonical strings like "A:<id>" or "U:<id>"
      const currentMap = new Map<string, string>();
      for (const r of currentRelationships) {
        const rel = r as any;
        const type = rel.type_ || rel.relationship_type || '';

        // Prefer canonical fields if available
        const a = rel.canonical_a ?? (() => {
          if (rel.person_a_alter_id) return `A:${String(rel.person_a_alter_id)}`;
          if (rel.person_a_user_id) return `U:${String(rel.person_a_user_id)}`;
          return null;
        })();
        const b = rel.canonical_b ?? (() => {
          if (rel.person_b_alter_id) return `A:${String(rel.person_b_alter_id)}`;
          if (rel.person_b_user_id) return `U:${String(rel.person_b_user_id)}`;
          return null;
        })();

        if (!a || !b) continue;
        const key = `${a}|${b}|${type}`;
        if (rel.id) currentMap.set(key, String(rel.id));
      }

      // Build desired relationship keys and payloads from the form
      const desiredKeys = new Set<string>();
      const desiredPayloads: Array<{ a: string; b: string; relationship_type: string; is_past_life: number }> = [];

      const pushDesired = (a: string, b: string, relationship_type: string) => {
        const key = `${a}|${b}|${relationship_type}`;
        desiredKeys.add(key);
        desiredPayloads.push({ a, b, relationship_type, is_past_life: 0 });
      };

      // Alter<->Alter relationships
      (relationships.partners || []).forEach((_otherId) => {
        const a = `A:${_otherId}`;
        const b = `A:${alterId}`;
        pushDesired(a, b, 'partner');
      });
      (relationships.parents || []).forEach((_otherId) => {
        const a = `A:${_otherId}`;
        const b = `A:${alterId}`;
        pushDesired(a, b, 'parent');
      });
      (relationships.children || []).forEach((_otherId) => {
        const a = `A:${alterId}`;
        const b = `A:${_otherId}`;
        pushDesired(a, b, 'child');
      });

      // User<->Alter relationships
      (userRelationships.partners || []).forEach((_otherId) => {
        const a = `U:${_otherId}`;
        const b = `A:${alterId}`;
        pushDesired(a, b, 'partner');
      });
      (userRelationships.parents || []).forEach((_otherId) => {
        const a = `U:${_otherId}`;
        const b = `A:${alterId}`;
        pushDesired(a, b, 'parent');
      });
      (userRelationships.children || []).forEach((_otherId) => {
        const a = `A:${alterId}`;
        const b = `U:${_otherId}`;
        pushDesired(a, b, 'child');
      });

      // Delete relationships that exist currently but are no longer desired
      const toDelete: string[] = [];
      for (const [key, relId] of currentMap.entries()) {
        if (!desiredKeys.has(key)) {
          toDelete.push(relId);
        }
      }

      if (toDelete.length) {
        await Promise.allSettled(toDelete.map((rid) => relationshipService.deleteRelationship(rid)));
      }

      // Create relationships that are desired but not already present
      const toCreate = desiredPayloads.filter((p) => {
        const key = `${p.a}|${p.b}|${p.relationship_type}`;
        return !currentMap.has(key);
      });

      if (toCreate.length) {
        await Promise.allSettled(toCreate.map((p) => relationshipService.createRelationship(p as any)));
      }
    },
    [id, preparePayload, values._files, values.images, handleFileUpload],
  );

  const submit = useCallback(
    async (partnerMap: Record<string, string>) => {
      setErrors({});

      // Basic validation
      const nameValue = typeof values.name === 'string' ? values.name.trim() : '';
      if (!nameValue) {
        setErrors({ name: 'Name required' });
        return;
      }
      if (nameValue.length > 200) {
        setErrors({ name: 'Name too long' });
        return;
      }

      try {
        if (mode === 'create') {
          await createAlter(partnerMap);
          setValues(emptyAlter);

          if (onCreated) {
            try {
              await onCreated();
            } catch (e) {
              // ignore parent handler errors, still close locally
            }
          } else {
            onClose();
          }
        } else {
          await updateAlter(partnerMap);

          if (onSaved) {
            try {
              await onSaved();
            } catch (e) {
              // ignore errors from parent handler
              onClose();
            }
          } else {
            onClose();
          }
        }
      } catch (err) {
        console.error(`Failed to ${mode} alter`, err);
        const fieldErrors = extractFieldErrors(err);
        if (fieldErrors) {
          setErrors(fieldErrors);
        } else {
          setErrors({ general: mode === 'create' ? 'Failed to create alter' : 'Save failed' });
        }
      }
    },
    [values.name, mode, createAlter, updateAlter, onCreated, onSaved, onClose],
  );

  const changeValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setValues((prev) => ({ ...prev, _files: files }));
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setValues((prev) => ({
      ...prev,
      _files: (prev._files || []).filter((_, i) => i !== index),
    }));
  }, []);

  const deleteImage = useCallback(
    async (url: string) => {
      if (mode !== 'edit' || !id) return;

      try {
        await alterService.deleteAlterImage(id as any, url);

        setValues((prev) => {
          const existing = Array.isArray(prev.images) ? prev.images : prev.images ? [String(prev.images)] : [];
          return { ...prev, images: existing.filter((u: string) => u !== url) };
        });
      } catch (e) {
        // ignore for now; UI remains unchanged
      }
    },
    [mode, id],
  );

  const reorderImages = useCallback((from: number, to: number) => {
    setValues((prev) => {
      const imgs = Array.isArray(prev.images) ? [...prev.images] : [];
      if (from < 0 || from >= imgs.length || to < 0 || to >= imgs.length) return prev;
      const [moved] = imgs.splice(from, 1);
      imgs.splice(to, 0, moved);
      return { ...prev, images: imgs };
    });
  }, []);

  return {
    values,
    errors,
    uploading,
    progressMap,
    changeValue,
    addFiles,
    removePendingFile,
    deleteImage,
    reorderImages,
    submit,
  };
}
