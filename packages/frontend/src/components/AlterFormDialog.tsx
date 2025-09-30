import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

import AlterFormFields from './AlterForm';
import { apiClient, type Alter } from '@didhub/api-client';

export interface AlterFormDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onSaved?: () => void;
  id?: string | number;
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
  soul_songs: '',
  interests: '',
  triggers: '',
  notes: '',
  affiliation: [],
  subsystem: '',
  group: '',
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

export default function AlterFormDialog(props: AlterFormDialogProps) {
  const { mode, open, onClose, onCreated, onSaved, id } = props;

  const [values, setValues] = useState<Partial<Alter> & { _files?: File[] }>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<boolean>(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [partnerOptions, setPartnerOptions] = useState<string[]>([]);
  const [partnerMap, setPartnerMap] = useState<Record<string, number | string>>({});
  const [userPartnerOptions, setUserPartnerOptions] = useState<string[]>([]);
  const [userPartnerMap, setUserPartnerMap] = useState<Record<string, number | string>>({});
  const [originalUserRelationships, setOriginalUserRelationships] = useState<any[]>([]);

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
      const fromMap = userPartnerMap[trimmed];
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

  useEffect(() => {
    fetchPartnerOptions();
    fetchUserPartnerOptions();
  }, []);

  useEffect(() => {
    if (mode === 'edit' && open && id) {
      load();
    } else if (mode === 'create' && open) {
      setValues(empty);
      setErrors({});
      setOriginalUserRelationships([]);
    }
  }, [mode, open, id]);

  async function fetchPartnerOptions() {
    try {
      const result = await apiClient.alters.names();
      const items = result.filter((it) => it && it.name);
      const names = items.map((x) => x.name ?? '').filter(Boolean);
      const selfName = mode === 'edit' && values && values.name ? values.name : null;
      setPartnerOptions(selfName ? names.filter((n) => n !== selfName) : names);
      const m: Record<string, number | string> = {};
      for (const it of items) {
        if (it && it.name && typeof it.id !== 'undefined') m[String(it.name).toLowerCase()] = it.id as number | string;
      }
      setPartnerMap(m);
    } catch (e) {
      // ignore
    }
  }

  async function fetchUserPartnerOptions() {
    try {
      const result = await apiClient.users.list({ perPage: 200 });
      const items = (result.items || []).filter((it) => it && it.username);
      setUserPartnerOptions(items.map((x) => x.username || '').filter(Boolean));
      const m: Record<string, number | string> = {};
      for (const it of items) {
        if (it && it.username && typeof it.id !== 'undefined') m[it.username] = it.id as number | string;
      }
      setUserPartnerMap(m);
      console.log(
        'User partner options:',
        items.map((x) => x.username || ''),
      );
      console.log('User partner map:', m);
    } catch (e) {
      console.warn('Failed to fetch user options:', e);
    }
  }

  async function load() {
    if (mode !== 'edit' || !id) return;
    const r = await apiClient.alters.get(id);
    if (r) {
      // Store original user relationships for comparison
      const userRelationships = r.user_relationships || [];
      setOriginalUserRelationships(userRelationships);

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

      setValues({
        ...r,
        user_partners,
        user_parents,
        user_children,
      });
    } else {
      setValues({});
      setOriginalUserRelationships([]);
    }
    setErrors({});
  }

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
    // Convert partner names to IDs when possible
    if (Array.isArray((payload as any).partners)) {
      (payload as any).partners = (payload as any).partners.map((p: any) => {
        if (typeof p === 'number') return p;
        if (typeof p === 'string') {
          const id = partnerMap[String(p).toLowerCase()];
          return typeof id !== 'undefined' ? id : p;
        }
        return p;
      });
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
      try {
        const created = await apiClient.alters.create(payload);
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
      // convert partner names to ids when possible
      if (Array.isArray((editPayload as any).partners)) {
        (editPayload as any).partners = (editPayload as any).partners.map((p: any) => {
          if (typeof p === 'number') return p;
          if (typeof p === 'string') {
            const id = partnerMap[String(p).toLowerCase()];
            return typeof id !== 'undefined' ? id : p;
          }
          return p;
        });
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
          onChange={change}
          onFile={onFile}
          onRemovePendingFile={removePending}
          onDeleteImage={mode === 'edit' ? handleDeleteImage : undefined}
          onReorderImages={reorderImages}
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
