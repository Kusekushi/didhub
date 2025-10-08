import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import { Group, GroupMembersResponse } from '../Types';
import { safeJsonParse } from '../Util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLeaderIds(value: unknown): number[] {
  const attemptParse = (entry: unknown): number | undefined => {
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed.replace(/^#/u, ''));
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    if (entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>)) {
      return attemptParse((entry as { id?: unknown }).id);
    }
    return undefined;
  };

  const dedupe = (ids: number[]): number[] => {
    const seen = new Set<number>();
    const result: number[] = [];
    ids.forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    });
    return result;
  };

  if (Array.isArray(value)) {
    return dedupe(
      value.map((entry) => attemptParse(entry)).filter((entry): entry is number => typeof entry === 'number'),
    );
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      const parsed = safeJsonParse<unknown>(trimmed, []);
      return normalizeLeaderIds(parsed);
    }
    return dedupe(
      trimmed
        .split(',')
        .map((segment) => attemptParse(segment))
        .filter((segment): segment is number => typeof segment === 'number'),
    );
  }

  if (typeof value === 'number') return [value];

  if (value && typeof value === 'object') {
    return normalizeLeaderIds([value]);
  }

  return [];
}

function normalizeGroup(input: unknown): Group {
  if (!isRecord(input)) return input as Group;
  const group = input as Record<string, unknown>;

  const parseOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed.replace(/^#/u, ''));
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
      return parseOptionalNumber((value as { id?: unknown }).id);
    }
    return undefined;
  };

  const normalized: Record<string, unknown> = {
    ...group,
    leaders: normalizeLeaderIds(group.leaders),
    sigil: safeJsonParse<unknown>(group.sigil, group.sigil ?? null),
    metadata: safeJsonParse<unknown>(group.metadata, null),
  };

  const id = parseOptionalNumber(group.id);
  if (typeof id === 'number') {
    normalized.id = id;
  } else {
    delete normalized.id;
  }

  const ownerId = parseOptionalNumber(group.owner_user_id);
  delete normalized.owner_user_id;
  if (typeof ownerId === 'number') {
    normalized.owner_user_id = ownerId;
  } else if (group.owner_user_id != null) {
    normalized.owner_user_id = null;
  }

  return normalized as Group;
}

export interface GroupListFilters {
  query?: string;
  includeMembers?: boolean;
  owner_user_id?: string | number;
  rawQuery?: string;
  limit?: number;
  offset?: number;
}

export class GroupsApi {
  constructor(private readonly http: HttpClient) {}

  async listPaged(filters: GroupListFilters = {}): Promise<Page<Group>> {
    const fields: Record<string, string> = {};
    if (filters.includeMembers) fields.fields = 'members';

    if (typeof filters.owner_user_id !== 'undefined') {
      fields.owner_user_id = String(filters.owner_user_id);
    }

    const queryString = filters.rawQuery
      ? filters.rawQuery.replace(/^\?/, '')
      : filters.query
        ? `q=${encodeURIComponent(filters.query)}`
        : '';

    const query = new URLSearchParams(queryString || '');
    Object.entries(fields).forEach(([key, value]) => {
      query.set(key, value);
    });
    if (typeof filters.limit === 'number') query.set('limit', String(filters.limit));
    if (typeof filters.offset === 'number') query.set('offset', String(filters.offset));

    const response = await this.http.request<unknown>({
      path: '/api/groups',
      query: Object.fromEntries(query.entries()),
    });

    const payload = isRecord(response.data) ? response.data : {};
    let items: Group[] = [];

    if (Array.isArray(response.data)) {
      items = response.data.map((item) => normalizeGroup(item));
    } else if (Array.isArray((payload as { items?: unknown[] }).items)) {
      items = ((payload as { items?: unknown[] }).items ?? []).map((item) => normalizeGroup(item));
    }

    return createPage<Group>({
      items,
      total: typeof payload.total === 'number' ? payload.total : undefined,
      limit: typeof payload.limit === 'number' ? payload.limit : filters.limit,
      offset: typeof payload.offset === 'number' ? payload.offset : filters.offset,
    });
  }

  async list(filters: GroupListFilters = {}): Promise<Group[]> {
    const page = await this.listPaged(filters);
    return page.items;
  }

  async get(id: string | number): Promise<Group | null> {
    const response = await this.http.request<Group | null>({
      path: `/api/groups/${id}`,
      acceptStatuses: [404],
    });
    if (response.status === 404 || response.data == null) return null;
    return normalizeGroup(response.data);
  }

  async create(payload: Record<string, unknown>): Promise<Group> {
    const outPayload = { ...payload } as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(outPayload, 'owner_user_id')) {
      const raw = outPayload.owner_user_id;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed !== '' && /^#?\d+$/.test(trimmed)) {
          outPayload.owner_user_id = Number(trimmed.replace(/^#/, ''));
        }
      }
    }

    const response = await this.http.request<Group>({
      path: '/api/groups',
      method: 'POST',
      json: outPayload,
    });
    return normalizeGroup(response.data);
  }

  async update(id: string | number, payload: Record<string, unknown>): Promise<Group> {
    const response = await this.http.request<Group>({
      path: `/api/groups/${id}`,
      method: 'PUT',
      json: payload,
    });
    return normalizeGroup(response.data);
  }

  async remove(id: string | number): Promise<void> {
    await this.http.request({
      path: `/api/groups/${id}`,
      method: 'DELETE',
      parse: 'none',
      acceptStatuses: [404],
    });
  }

  async listMembers(groupId: string | number): Promise<GroupMembersResponse> {
    const parseId = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const numeric = Number(trimmed.replace(/^#/u, ''));
        return Number.isFinite(numeric) ? numeric : undefined;
      }
      return undefined;
    };

    const fallbackGroupId = parseId(groupId);
    const response = await this.http.request<GroupMembersResponse>({
      path: `/api/groups/${groupId}/members`,
    });
    const fallback: GroupMembersResponse =
      fallbackGroupId != null ? { group_id: fallbackGroupId, alters: [] } : { alters: [] };
    if (!response.data || typeof response.data !== 'object') return fallback;
    const payload = response.data as Record<string, unknown>;
    const rawAlters = Array.isArray(payload.alters) ? (payload.alters as unknown[]) : [];
    const alters = rawAlters
      .map((value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const numeric = Number(value.trim());
          return Number.isFinite(numeric) ? numeric : undefined;
        }
        return undefined;
      })
      .filter((value): value is number => typeof value === 'number');
    const payloadGroupId = parseId(payload.group_id);
    const resolvedGroupId = payloadGroupId ?? fallbackGroupId;
    return resolvedGroupId != null ? { group_id: resolvedGroupId, alters } : { alters };
  }

  async downloadPdf(id: string | number): Promise<Response> {
    const response = await this.http.request({
      path: `/api/pdf/group/${id}`,
      parse: 'none',
    });
    return response.raw;
  }
}
