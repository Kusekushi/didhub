import { useState, useCallback, useEffect } from 'react';
import {
  apiClient,
  type ApiReplaceAlterRelationshipsPayload,
  type ApiReplaceRelationshipsPayload,
  type ApiUploadResp,
} from '@didhub/api-client';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveOwnerId } from '../utils/owner';
import {
  extractNumericIds,
  collectRelationshipIds,
  normalizeAffiliationIds,
  processArrayField,
  extractFieldErrors,
} from '../utils/alterFormUtils';

export interface AlterFormDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  onCreated?: () => Promise<void> | void;
  onSaved?: () => Promise<void> | void;
  id?: string | number;
  routeUid?: string | number | null;
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
  userId: number;
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
  interests: [],
  triggers: '',
  notes: '',
  affiliations: [],
  subsystem: null,
  system_roles: [],
  is_system_host: 0,
  is_dormant: 0,
  is_merged: 0,
};

const alterApi = {
  async get(id: string | number): Promise<AlterFormState | null> {
    const response = await apiClient.alter.get_alters_by_id(id);
    const data = response.data ?? null;
    return data ? ({ ...data } as unknown as AlterFormState) : null;
  },
  async create(body: Record<string, unknown>): Promise<AlterFormState | null> {
    const response = await apiClient.alter.post_alters(body as any);
    const data = response.data ?? null;
    return data ? ({ ...data } as unknown as AlterFormState) : null;
  },
  async update(id: string | number, body: Record<string, unknown>): Promise<void> {
    await apiClient.alter.put_alters_by_id(id, body as any);
  },
  async replaceAlterRelationships(
    id: string | number,
    relationships: { partners: number[]; parents: number[]; children: number[] },
    affiliations: unknown,
  ): Promise<void> {
    const affiliationList = Array.isArray(affiliations)
      ? affiliations
      : typeof affiliations === 'string'
        ? affiliations.split(',').map((v) => v.trim()).filter(Boolean)
        : [];
    const payload: ApiReplaceAlterRelationshipsPayload = {
      partners: (relationships.partners ?? []).map((value) => String(value)),
      parents: (relationships.parents ?? []).map((value) => String(value)),
      children: (relationships.children ?? []).map((value) => String(value)),
      affiliations: affiliationList.map((value) => String(value)),
    };
    await apiClient.alter.put_alters_by_id_alter_relationships(id, payload);
  },
  async replaceUserRelationships(
    id: string | number,
    userRelationships: { partners: number[]; parents: number[]; children: number[] },
  ): Promise<void> {
    const payload: ApiReplaceRelationshipsPayload = {
      partners: (userRelationships.partners ?? []).map((value) => String(value)),
      parents: (userRelationships.parents ?? []).map((value) => String(value)),
      children: (userRelationships.children ?? []).map((value) => String(value)),
    };
    await apiClient.alter.put_alters_by_id_user_relationships(id, payload);
  },
};

function isRelationshipType(value: unknown): value is RelationshipType {
  return value === 'partner' || value === 'parent' || value === 'child';
}

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
      const alter = await alterApi.get(id);
      if (alter) {
        const userRelationships = Array.isArray(alter.user_relationships)
          ? (alter.user_relationships as Array<Record<string, unknown>>)
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

  const affiliationIds = normalizeAffiliationIds(alter.affiliations) ?? [];

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

  const resolveUserId = useCallback((value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed);
      return Number.isNaN(numeric) ? undefined : numeric;
    }
    return undefined;
  }, []);

  const buildRelationshipEntries = useCallback(
    (source: unknown, type: RelationshipType): RelationshipEntry[] => {
      if (!Array.isArray(source)) return [];
      return source
        .map((value) => resolveUserId(value))
        .filter((id): id is number => typeof id === 'number')
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

        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.files.post_upload(formData);
        const data = response.data as ApiUploadResp | undefined;
        setProgressMap((prev) => ({ ...prev, [file.name]: 100 }));

        if (data && data.filename) {
          const normalizedUrl = `/uploads/${data.filename}`;
          urls.push(normalizedUrl);
        }
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
    (partnerMap: Record<string, number | string>) => {
      const payload: Record<string, unknown> = { ...values };

      // Process array fields
      if (typeof payload.soul_songs === 'string' && payload.soul_songs) {
        payload.soul_songs = processArrayField(payload.soul_songs);
      }
      if (payload.interests && typeof payload.interests === 'string') {
        payload.interests = processArrayField(payload.interests);
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

      const dedupeByType = (type: RelationshipType): number[] => {
        const seen = new Set<number>();
        return desiredUserRelationships
          .filter((entry) => entry.type === type)
          .map((entry) => entry.userId)
          .filter((userId) => {
            if (seen.has(userId)) return false;
            seen.add(userId);
            return true;
          });
      };

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
    async (partnerMap: Record<string, number | string>) => {
      const { payload, relationships, userRelationships } = preparePayload(partnerMap);

      // Handle file uploads
      if (values._files && values._files.length) {
        const urls = await handleFileUpload(values._files);
        payload.images = urls;
      }

      // Set owner for new alters
      const owner = getEffectiveOwnerId(routeUid == null ? undefined : String(routeUid), auth.user?.id ?? null);
      if (typeof owner === 'number' || typeof owner === 'string') {
        payload.owner_user_id = owner;
      }

      const created = await alterApi.create(payload);

      if (created?.id) {
        const alterId = Number(created.id);

        // Set relationships
        await alterApi.replaceAlterRelationships(alterId, relationships, payload.affiliations);

        try {
          await alterApi.replaceUserRelationships(alterId, userRelationships);
        } catch (e) {
          console.warn('Failed to replace user relationships:', e);
        }
      }

      return created;
    },
    [preparePayload, values._files, handleFileUpload, routeUid, auth.user?.id],
  );

  const updateAlter = useCallback(
    async (partnerMap: Record<string, number | string>) => {
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

      await alterApi.update(id, payload);
      await alterApi.replaceAlterRelationships(Number(id), relationships, payload.affiliations);

      try {
        await alterApi.replaceUserRelationships(Number(id), userRelationships);
      } catch (e) {
        console.warn('Failed to replace user relationships:', e);
      }
    },
    [id, preparePayload, values._files, values.images, handleFileUpload],
  );

  const submit = useCallback(
    async (partnerMap: Record<string, number | string>) => {
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

  const deleteImage = useCallback(async (url: string) => {
    if (mode !== 'edit' || !id) return;

    try {
      await apiClient.http.request({
        path: `/api/alters/${id}/image`,
        method: 'DELETE',
        json: { url },
      });

      setValues((prev) => {
        const existing = Array.isArray(prev.images)
          ? prev.images
          : prev.images
            ? [String(prev.images)]
            : [];
        return { ...prev, images: existing.filter((u: string) => u !== url) };
      });
    } catch (e) {
      // ignore for now; UI remains unchanged
    }
  }, [mode, id]);

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