import { Alter, AlterName, FamilyTreeResponse, PaginatedResponse, UserAlterRelationship } from '../Types';
import { safeJsonParse, apiFetch, ApiFetchResult, ApiFetchResultError } from '../Util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAlter(alter: unknown): Alter {
  if (!isRecord(alter)) return alter as Alter;
  const a = alter as Partial<Alter> & Record<string, unknown>;
  return {
    ...a,
    partners: Array.isArray(a.partners)
      ? a.partners
      : safeJsonParse<Array<string | number>>(
        a.partners,
        typeof a.partners === 'string' ? a.partners.split(',').map((s) => s.trim()) : [],
      ),
    parents: Array.isArray(a.parents)
      ? a.parents
      : safeJsonParse<Array<string | number>>(
        a.parents,
        typeof a.parents === 'string' ? a.parents.split(',').map((s) => s.trim()) : [],
      ),
    children: Array.isArray(a.children)
      ? a.children
      : safeJsonParse<Array<string | number>>(
        a.children,
        typeof a.children === 'string' ? a.children.split(',').map((s) => s.trim()) : [],
      ),
    soul_songs: Array.isArray(a.soul_songs)
      ? a.soul_songs
      : safeJsonParse<string[]>(
        a.soul_songs,
        typeof a.soul_songs === 'string' ? a.soul_songs.split(',').map((s) => s.trim()) : [],
      ),
    interests: Array.isArray(a.interests)
      ? a.interests
      : safeJsonParse<string[]>(
        a.interests,
        typeof a.interests === 'string' ? a.interests.split(',').map((s) => s.trim()) : [],
      ),
    affiliation: Array.isArray(a.affiliation)
      ? a.affiliation
      : safeJsonParse<string[]>(
        a.affiliation,
        typeof a.affiliation === 'string' ? a.affiliation.split(',').map((s) => s.trim()) : [],
      ),
    system_roles: Array.isArray(a.system_roles)
      ? a.system_roles
      : safeJsonParse<string[]>(
        a.system_roles,
        typeof a.system_roles === 'string' ? a.system_roles.split(',').map((s) => s.trim()) : [],
      ),
    images: ((Array.isArray(a.images)
      ? a.images // FIXME: This is weird. We should get rid of most of this map function
      : safeJsonParse<string[]>(a.images, typeof a.images === 'string' ? a.images.split(',').map((s) => s.trim()) : [])) || []).map((img) => {
        if (img.startsWith('/uploads/')) return img;
        if (img.startsWith('/did-system/')) return img.replace('/did-system/', '/uploads/');
        return '/uploads/' + img;
      }),
    user_relationships: Array.isArray(a.user_relationships) ? a.user_relationships : [],
  } as Alter;
}

export async function fetchAltersBySystem(uid: string, includeRelationships = false): Promise<Alter[] | ApiFetchResultError> {
  const params = new URLSearchParams();
  params.set('user_id', uid);
  params.set('fields', includeRelationships ? 'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images,relationships' : 'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images');
  const r = await apiFetch<PaginatedResponse<Alter>>('/api/alters?' + params.toString());
  if (!r || typeof r !== 'object' || r.status !== 200) return { status: r?.status ?? 404 } as ApiFetchResultError;
  const items = r.json?.items ?? [];
  return items.map(normalizeAlter);
}

export async function fetchAltersSearch(uid: string, q: string, includeRelationships = false): Promise<Alter[] | ApiFetchResultError> {
  const params = new URLSearchParams();
  params.set('user_id', uid);
  params.set('q', q);
  params.set('per_page', '1000');
  params.set('fields', includeRelationships ? 'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images,relationships' : 'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images');
  const r = await apiFetch<PaginatedResponse<Alter>>('/api/alters?' + params.toString());
  if (!r || typeof r !== 'object' || r.status !== 200) return { status: r?.status ?? 404 } as ApiFetchResultError;
  const items = r.json?.items ?? [];
  return items.map(normalizeAlter);
}

type AlterListResponse = PaginatedResponse<Alter> & Record<string, unknown>;

export async function fetchAlters(q = '', includeRelationships = false): Promise<AlterListResponse> {
  const qs: string[] = [];
  if (q) qs.push('q=' + encodeURIComponent(q));
  if (includeRelationships) qs.push('fields=id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images,relationships');
  qs.push('per_page=1000');
  const query = qs.length ? '?' + qs.join('&') : '';
  return apiFetch<AlterListResponse>('/api/alters' + query).then((r) => {
    const j = r.json ?? { items: [] };
    if (Array.isArray(j.items)) j.items = j.items.map(normalizeAlter);
    return j;
  });
}

export async function getAlter(id: string | number): Promise<Alter> {
  return apiFetch<Alter | null>('/api/alters/' + id).then((r) => normalizeAlter(r.json ?? {}));
}

export async function createAlter(payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/alters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateAlter(id: string | number, payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/alters/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAlter(id: string | number): Promise<ApiFetchResult> {
  return apiFetch('/api/alters/' + id, { method: 'DELETE' });
}

export async function deleteAlterImage(alterId: string | number, url: string): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/alters/' + alterId + '/image', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then((r) => r.json ?? {});
}

export async function fetchAlterNames(q = ''): Promise<AlterName[]> {
  return apiFetch<AlterName[]>('/api/alters/names' + (q ? '?q=' + encodeURIComponent(q) : '')).then(
    (r) => r.json ?? [],
  );
}

export async function fetchAlterNamesByUser(user_id: string | number | undefined, q = ''): Promise<AlterName[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (user_id != null) params.set('user_id', String(user_id));
  const qs = params.toString() ? '?' + params.toString() : '';
  return apiFetch<AlterName[]>('/api/alters/names' + qs).then((r) => r.json ?? []);
}

export async function fetchFamilyTree(): Promise<FamilyTreeResponse> {
  return apiFetch<FamilyTreeResponse>('/api/alters/family-tree').then((r) => r.json ?? { nodes: {}, edges: { parent: [], partner: [] }, roots: [] });
}

export async function createUserAlterRelationship(alterId: number, userId: number, relationshipType: 'partner' | 'parent' | 'child'): Promise<ApiFetchResult> {
  return apiFetch(`/api/alters/${alterId}/relationships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, relationship_type: relationshipType }),
  });
}

export async function deleteUserAlterRelationship(alterId: number, userId: number, relationshipType: 'partner' | 'parent' | 'child'): Promise<ApiFetchResult> {
  return apiFetch(`/api/alters/${alterId}/relationships/${userId}/${relationshipType}`, {
    method: 'DELETE',
  });
}

export async function listUserAlterRelationships(alterId: number): Promise<UserAlterRelationship[]> {
  return apiFetch<UserAlterRelationship[]>(`/api/alters/${alterId}/relationships`).then((r) => r.json ?? []);
}
