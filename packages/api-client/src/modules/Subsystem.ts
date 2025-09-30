import { safeJsonParse, apiFetch, ApiFetchResult } from '../Util';
import type { Subsystem, SubsystemMember, PaginatedResponse } from '../Types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSubsystem(subsystem: unknown): Subsystem {
  if (!isRecord(subsystem)) return subsystem as Subsystem;
  const s = subsystem as Partial<Subsystem> & Record<string, unknown>;
  return {
    ...s,
    leaders: Array.isArray(s.leaders) ? s.leaders : [],
    metadata: safeJsonParse<unknown>(s.metadata, null),
  };
}

export async function listSubsystems(
  q = '',
  ownerUserId?: string,
  includeMembers = false,
): Promise<Subsystem[]> {
  // If caller passed a raw querystring (e.g. "?owner_user_id=2"), use it as-is.
  const params = new URLSearchParams();
  if (includeMembers) params.set('fields', 'members');
  const fieldsQuery = params.toString() ? '&' + params.toString() : '';

  if (q && q.startsWith('?')) {
    const qs = q;
    return apiFetch<PaginatedResponse<Subsystem> | Subsystem[]>(
      '/api/subsystems' + qs + fieldsQuery,
    ).then((r) => {
      const j = r.json ?? { items: [] };
      if (Array.isArray(j)) return j.map(normalizeSubsystem);
      if (isRecord(j) && Array.isArray(j.items)) return j.items.map(normalizeSubsystem);
      return [];
    });
  }
  const params2: string[] = [];
  if (q) params2.push('q=' + encodeURIComponent(q));
  if (ownerUserId) params2.push('owner_user_id=' + encodeURIComponent(ownerUserId));
  const qs = params2.length ? '?' + params2.join('&') : '';
  return apiFetch<PaginatedResponse<Subsystem> | Subsystem[]>('/api/subsystems' + qs + fieldsQuery).then((r) => {
    const j = r.json ?? { items: [] };
    if (Array.isArray(j)) return j.map(normalizeSubsystem);
    if (isRecord(j) && Array.isArray(j.items)) return j.items.map(normalizeSubsystem);
    return [];
  });
}

export async function getSubsystem(id: string | number): Promise<Subsystem | null> {
  return apiFetch<Subsystem | null>('/api/subsystems/' + id).then((r) => {
    const data = r.json;
    return data ? normalizeSubsystem(data) : null;
  });
}

export async function createSubsystem(payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/subsystems', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateSubsystem(id: string | number, payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/subsystems/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listSubsystemMembers(id: string | number): Promise<SubsystemMember[]> {
  return apiFetch<SubsystemMember[]>('/api/subsystems/' + id + '/members').then((r) => r.json ?? []);
}

export async function toggleSubsystemLeader(id: string | number, alterId: string | number, add = true): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/subsystems/' + id + '/leaders/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alter_id: alterId, add }),
  }).then((r) => r.json ?? {});
}

export async function setSubsystemMemberRoles(id: string | number, alterId: string | number, roles: unknown): Promise<ApiFetchResult> {
  return apiFetch('/api/subsystems/' + id + '/members/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alter_id: alterId, roles }),
  });
}

export async function migrateAlterSubsystems(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/admin/migrate-alter-subsystems', { method: 'POST' }).then(
    (r) => r.json ?? {},
  );
}

export async function deleteSubsystem(id: string | number): Promise<ApiFetchResult> {
  return apiFetch('/api/subsystems/' + id, { method: 'DELETE' });
}
