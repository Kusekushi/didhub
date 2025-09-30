import { Group, GroupMembersResponse, PaginatedResponse } from '../Types';
import { safeJsonParse, apiFetch, ApiFetchResult } from '../Util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeGroup(group: unknown): Group {
  if (!isRecord(group)) return group as Group;
  const g = group as Partial<Group> & Record<string, unknown>;
  return {
    ...g,
  sigil: safeJsonParse<unknown>(g.sigil, g.sigil ?? null),
    leaders: safeJsonParse<string[]>(g.leaders, []),
    metadata: safeJsonParse<unknown>(g.metadata, null),
  } as Group;
}

export async function listGroups(q = '', includeMembers = false): Promise<Array<Group>> {
  // allow callers to pass raw querystring like "?owner_user_id=..."
  const params = new URLSearchParams();
  if (includeMembers) params.set('fields', 'members');
  const fieldsQuery = params.toString() ? '&' + params.toString() : '';
  
  if (q && q.startsWith('?')) {
    return apiFetch<PaginatedResponse<Group> | Group[]>('/api/groups' + q + fieldsQuery).then((r) => {
      const j = r.json ?? { items: [] };
      if (Array.isArray(j)) return j.map(normalizeGroup);
      if (isRecord(j) && Array.isArray(j.items)) return j.items.map(normalizeGroup);
      return [] as Group[];
    });
  }
  return apiFetch<PaginatedResponse<Group> | Group[]>(
    '/api/groups' + (q ? '?q=' + encodeURIComponent(q) : '') + fieldsQuery,
  ).then((r) => {
    const j = r.json ?? { items: [] };
    if (Array.isArray(j)) return j.map(normalizeGroup);
    if (isRecord(j) && Array.isArray(j.items)) return j.items.map(normalizeGroup);
    return [] as Group[];
  });
}

export async function getGroup(id: string | number): Promise<Group | null> {
  return apiFetch<Group | null>('/api/groups/' + id).then((r) => {
    const data = r.json;
    return data ? normalizeGroup(data) : null;
  });
}

export async function createGroup(payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateGroup(id: string | number, payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/groups/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteGroup(id: string | number): Promise<ApiFetchResult> {
  return apiFetch('/api/groups/' + id, { method: 'DELETE' });
}

export async function listGroupMembers(groupId: string | number): Promise<GroupMembersResponse> {
  return apiFetch<GroupMembersResponse>('/api/groups/' + groupId + '/members').then((r) => {
    const fallback: GroupMembersResponse = { group_id: groupId, alters: [] };
    const payload = r.json;
    if (!payload || typeof payload !== 'object') return fallback;
    const alters = Array.isArray(payload.alters)
      ? payload.alters.filter((value): value is number | string =>
          typeof value === 'number' || typeof value === 'string',
        )
      : [];
    return {
      group_id: payload.group_id ?? groupId,
      alters,
    };
  });
}
