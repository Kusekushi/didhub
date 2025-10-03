import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import { Group, GroupMembersResponse } from '../Types';
import { safeJsonParse } from '../Util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeGroup(input: unknown): Group {
  if (!isRecord(input)) return input as Group;
  const group = input as Partial<Group> & Record<string, unknown>;
  return {
    ...group,
    sigil: safeJsonParse<unknown>(group.sigil, group.sigil ?? null),
    leaders: safeJsonParse<string[]>(group.leaders, []),
    metadata: safeJsonParse<unknown>(group.metadata, null),
  } as Group;
}

export interface GroupListFilters {
  query?: string;
  includeMembers?: boolean;
  ownerUserId?: string | number;
  rawQuery?: string;
  limit?: number;
  offset?: number;
}

export class GroupsApi {
  constructor(private readonly http: HttpClient) {}

  async listPaged(filters: GroupListFilters = {}): Promise<Page<Group>> {
    const fields: Record<string, string> = {};
    if (filters.includeMembers) fields.fields = 'members';

    if (typeof filters.ownerUserId !== 'undefined') {
      fields.owner_user_id = String(filters.ownerUserId);
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
    const response = await this.http.request<Group>({
      path: '/api/groups',
      method: 'POST',
      json: payload,
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
    const response = await this.http.request<GroupMembersResponse>({
      path: `/api/groups/${groupId}/members`,
    });
    const fallback: GroupMembersResponse = { group_id: groupId, alters: [] };
    if (!response.data || typeof response.data !== 'object') return fallback;
    const payload = response.data as GroupMembersResponse;
    const alters = Array.isArray(payload.alters)
      ? payload.alters.filter(
          (value): value is number | string => typeof value === 'number' || typeof value === 'string',
        )
      : [];
    return {
      group_id: payload.group_id ?? groupId,
      alters,
    };
  }
}
