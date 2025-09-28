import { Group, GroupMember } from '../Types';
import { safeJsonParse, apiFetch, ApiFetchResult } from '../Util';

function normalizeGroup(group: unknown): Group {
  if (!group) return group as Group;
  const g = group as Record<string, any>;
  return {
    ...g,
    sigil: safeJsonParse<unknown>(g.sigil, null),
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
    return apiFetch('/api/groups' + q + fieldsQuery).then((r: ApiFetchResult) => {
      const j = r.json || {};
      if (Array.isArray(j)) return j.map(normalizeGroup);
      if (j && Array.isArray((j as any).items)) return (j as any).items.map(normalizeGroup);
      return [] as Group[];
    });
  }
  return apiFetch('/api/groups' + (q ? '?q=' + encodeURIComponent(q) : '') + fieldsQuery).then((r: ApiFetchResult) => {
    const j = r.json || {};
    if (Array.isArray(j)) return j.map(normalizeGroup);
    if (j && Array.isArray((j as any).items)) return (j as any).items.map(normalizeGroup);
    return [] as Group[];
  });
}

export async function getGroup(id: string | number): Promise<Group> {
  return apiFetch('/api/groups/' + id).then((r: ApiFetchResult) => normalizeGroup(r.json || null));
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

export async function listGroupMembers(groupId: string | number): Promise<GroupMember[]> {
  return apiFetch('/api/groups/' + groupId + '/members').then((r: ApiFetchResult) => r.json || {});
}
