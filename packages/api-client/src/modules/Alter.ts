import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import { Alter, AlterName, FamilyTreeResponse, UserAlterRelationship } from '../Types';
import { safeJsonParse } from '../Util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAlter(input: unknown): Alter {
  if (!isRecord(input)) return input as Alter;
  const alter = input as Partial<Alter> & Record<string, unknown>;

  const normalizeStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        const parsed = safeJsonParse<string[]>(trimmed, []);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      }
      return trimmed
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
    return [];
  };

  const normalizeIdArray = (value: unknown): Array<string | number> => {
    if (Array.isArray(value)) return value as Array<string | number>;
    if (typeof value === 'string') {
      const parsed = normalizeStringArray(value);
      return parsed.map((id) => (Number.isFinite(Number(id)) ? Number(id) : id));
    }
    if (typeof value === 'number') return [value];
    return [];
  };

  const images = (() => {
    const raw = Array.isArray(alter.images)
      ? alter.images
      : safeJsonParse<string[]>(
        alter.images,
        typeof alter.images === 'string' ? normalizeStringArray(alter.images) : [],
      );
    if (!Array.isArray(raw)) return [];
    return raw
      .map((img) => String(img))
      .map((img) => {
        if (img.startsWith('/uploads/')) return img;
        if (img.startsWith('/did-system/')) return img.replace('/did-system/', '/uploads/');
        if (img.startsWith('http://') || img.startsWith('https://')) return img;
        return `/uploads/${img.replace(/^\//, '')}`;
      });
  })();

  return {
    ...alter,
    partners: normalizeIdArray(alter.partners),
    parents: normalizeIdArray(alter.parents),
    children: normalizeIdArray(alter.children),
    soul_songs: normalizeStringArray(alter.soul_songs),
    interests: normalizeStringArray(alter.interests),
    affiliations: normalizeIdArray(alter.affiliations),
    system_roles: normalizeStringArray(alter.system_roles),
    images,
    user_relationships: Array.isArray(alter.user_relationships) ? alter.user_relationships : [],
  } as Alter;
}

function normalizeAlterName(input: unknown): AlterName {
  if (!isRecord(input)) {
    return {
      id: Number(input ?? 0) || 0,
      name: '',
      user_id: 0,
      username: '',
    };
  }

  const idRaw = (input as { id?: unknown }).id;
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw ?? 0) || 0;
  const nameRaw = (input as { name?: unknown }).name;
  const name = typeof nameRaw === 'string' ? nameRaw : nameRaw == null ? '' : String(nameRaw);
  const userIdRaw = (input as { user_id?: unknown }).user_id;
  const user_id = typeof userIdRaw === 'number'
    ? userIdRaw
    : typeof userIdRaw === 'string' && userIdRaw.trim() !== ''
      ? Number(userIdRaw)
      : 0;
  const usernameRaw = (input as { username?: unknown }).username;
  const username = typeof usernameRaw === 'string'
    ? usernameRaw
    : usernameRaw == null
      ? ''
      : String(usernameRaw);

  return { id, name, user_id, username };
}

export interface AlterListFilters {
  query?: string;
  includeRelationships?: boolean;
  perPage?: number;
  offset?: number;
  userId?: string | number;
}

export interface AlterSearchFilters extends AlterListFilters {
  userId: string;
}

export class AltersApi {
  constructor(private readonly http: HttpClient) { }

  async list(filters: AlterListFilters = {}): Promise<Page<Alter>> {
    const query: Record<string, string | number | undefined> = {};
    if (filters.query) query.q = filters.query;
    if (filters.includeRelationships) {
      query.fields =
        'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images,relationships';
    }
    if (typeof filters.perPage === 'number') query.per_page = filters.perPage;
    if (typeof filters.offset === 'number') query.offset = filters.offset;
    if (typeof filters.userId !== 'undefined') query.user_id =
      typeof filters.userId === 'number' ? filters.userId : String(filters.userId);

    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/alters',
      query,
    });

    const items = Array.isArray((response.data as { items?: unknown }).items)
      ? ((response.data as { items?: unknown }).items as unknown[]).map((item) => normalizeAlter(item))
      : Array.isArray(response.data)
        ? (response.data as unknown[]).map((item) => normalizeAlter(item))
        : [];

    const payload = isRecord(response.data) ? response.data : {};

    return createPage<Alter>({
      items,
      total: typeof payload.total === 'number' ? payload.total : undefined,
      limit:
        typeof payload.limit === 'number'
          ? payload.limit
          : typeof payload.per_page === 'number'
            ? payload.per_page
            : filters.perPage,
      offset: typeof payload.offset === 'number' ? payload.offset : filters.offset,
    });
  }

  async listBySystem(
    userId: string,
    options: Omit<AlterSearchFilters, 'userId' | 'query'> = {},
  ): Promise<Page<Alter>> {
    return this.list({
      userId,
      includeRelationships: options.includeRelationships,
      perPage: options.perPage,
      offset: options.offset,
    });
  }

  async search(filters: AlterSearchFilters): Promise<Alter[]> {
    const query: Record<string, string | number> = {
      user_id: filters.userId,
      q: filters.query ?? '',
      per_page: filters.perPage ?? 1000,
    };
    if (filters.includeRelationships) {
      query.fields =
        'id,name,age,pronouns,system_roles,is_system_host,is_dormant,is_merged,owner_user_id,images,relationships';
    }

    const response = await this.http.request<{ items?: unknown[] }>({
      path: '/api/alters',
      query,
    });

    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return items.map((item) => normalizeAlter(item));
  }

  async get(id: string | number): Promise<Alter | null> {
    const response = await this.http.request<Alter | null>({
      path: `/api/alters/${id}`,
      acceptStatuses: [404],
    });
    if (response.status === 404 || response.data == null) return null;
    return normalizeAlter(response.data);
  }

  async create(payload: Record<string, unknown>): Promise<Alter> {
    const response = await this.http.request<Alter>({
      path: '/api/alters',
      method: 'POST',
      json: payload,
    });
    return normalizeAlter(response.data);
  }

  async update(id: string | number, payload: Record<string, unknown>): Promise<Alter> {
    const response = await this.http.request<Alter>({
      path: `/api/alters/${id}`,
      method: 'PUT',
      json: payload,
    });
    return normalizeAlter(response.data);
  }

  async remove(id: string | number): Promise<void> {
    await this.http.request({
      path: `/api/alters/${id}`,
      method: 'DELETE',
      parse: 'none',
      acceptStatuses: [404],
    });
  }

  async removeImage(alterId: string | number, url: string): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: `/api/alters/${alterId}/image`,
      method: 'DELETE',
      json: { url },
    });
    return isRecord(response.data) ? response.data : {};
  }

  async names(query = ''): Promise<AlterName[]> {
    const response = await this.http.request<AlterName[]>({
      path: '/api/alters/names',
      query: query ? { q: query } : undefined,
    });
    return Array.isArray(response.data)
      ? response.data.map((item) => normalizeAlterName(item))
      : [];
  }

  async namesByUser(userId: string | number | undefined, query = ''): Promise<AlterName[]> {
    const search: Record<string, string> = {};
    if (query) search.q = query;
    if (userId != null) search.user_id = String(userId);
    const response = await this.http.request<AlterName[]>({
      path: '/api/alters/names',
      query: Object.keys(search).length ? search : undefined,
    });
    return Array.isArray(response.data)
      ? response.data.map((item) => normalizeAlterName(item))
      : [];
  }

  async familyTree(): Promise<FamilyTreeResponse> {
    const response = await this.http.request<FamilyTreeResponse>({
      path: '/api/alters/family-tree',
    });
    if (isRecord(response.data) && response.data.nodes) {
      return response.data as FamilyTreeResponse;
    }
    return { nodes: {}, edges: { parent: [], partner: [] }, roots: [] };
  }

  async listRelationships(alterId: number): Promise<UserAlterRelationship[]> {
    const response = await this.http.request<UserAlterRelationship[]>({
      path: `/api/alters/${alterId}/relationships`,
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async addRelationship(
    alterId: number,
    userId: number,
    relationshipType: 'partner' | 'parent' | 'child',
  ): Promise<void> {
    await this.http.request({
      path: `/api/alters/${alterId}/relationships`,
      method: 'POST',
      json: { user_id: userId, relationship_type: relationshipType },
      parse: 'none',
    });
  }

  async removeRelationship(
    alterId: number,
    userId: number,
    relationshipType: 'partner' | 'parent' | 'child',
  ): Promise<void> {
    await this.http.request({
      path: `/api/alters/${alterId}/relationships/${userId}/${relationshipType}`,
      method: 'DELETE',
      parse: 'none',
      acceptStatuses: [404],
    });
  }
}
