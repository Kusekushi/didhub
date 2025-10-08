import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import { parseRoles, safeJsonParse } from '../Util';
import type { Subsystem, SubsystemMember } from '../Types';

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

function normalizeSubsystem(input: unknown): Subsystem {
  if (!isRecord(input)) return input as Subsystem;
  const subsystem = input as Record<string, unknown>;

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
    ...subsystem,
    leaders: normalizeLeaderIds(subsystem.leaders),
    metadata: safeJsonParse<unknown>(subsystem.metadata, null),
  };

  const id = parseOptionalNumber(subsystem.id);
  if (typeof id === 'number') {
    normalized.id = id;
  } else {
    delete normalized.id;
  }

  const ownerId = parseOptionalNumber(subsystem.owner_user_id);
  delete normalized.owner_user_id;
  if (typeof ownerId === 'number') {
    normalized.owner_user_id = ownerId;
  } else if (subsystem.owner_user_id != null) {
    normalized.owner_user_id = null;
  }

  return normalized as Subsystem;
}

function normalizeSubsystemMember(input: unknown): SubsystemMember {
  if (!isRecord(input)) return input as SubsystemMember;
  const member = input as Record<string, unknown>;
  const alterIdSource = (member.alterId as unknown) ?? (member.alter_id as unknown);
  let alterId: number | undefined;
  if (typeof alterIdSource === 'number' && Number.isFinite(alterIdSource)) {
    alterId = alterIdSource;
  } else if (typeof alterIdSource === 'string') {
    const numeric = Number(alterIdSource.trim());
    alterId = Number.isFinite(numeric) ? numeric : undefined;
  } else if (alterIdSource != null) {
    const numeric = Number(alterIdSource);
    alterId = Number.isFinite(numeric) ? numeric : undefined;
  }

  const normalized: Record<string, unknown> = {
    ...member,
    alterId,
    roles: parseRoles(member.roles),
  };

  delete normalized.alter_id;

  return normalized as SubsystemMember;
}

export interface SubsystemListFilters {
  query?: string;
  owner_user_id?: string | number;
  includeMembers?: boolean;
  rawQuery?: string;
  limit?: number;
  offset?: number;
}

export class SubsystemsApi {
  constructor(private readonly http: HttpClient) {}

  async listPaged(filters: SubsystemListFilters = {}): Promise<Page<Subsystem>> {
    const searchParams = new URLSearchParams(filters.rawQuery ? filters.rawQuery.replace(/^\?/, '') : '');
    if (filters.query) searchParams.set('q', filters.query);
    if (typeof filters.owner_user_id !== 'undefined') searchParams.set('owner_user_id', String(filters.owner_user_id));
    if (filters.includeMembers) searchParams.set('fields', 'members');
    if (typeof filters.limit === 'number') searchParams.set('limit', String(filters.limit));
    if (typeof filters.offset === 'number') searchParams.set('offset', String(filters.offset));

    const response = await this.http.request<unknown>({
      path: '/api/subsystems',
      query: Object.fromEntries(searchParams.entries()),
    });

    const payload = isRecord(response.data) ? response.data : {};
    let items: Subsystem[] = [];

    if (Array.isArray(response.data)) {
      items = response.data.map((item) => normalizeSubsystem(item));
    } else if (Array.isArray((payload as { items?: unknown[] }).items)) {
      items = ((payload as { items?: unknown[] }).items ?? []).map((item) => normalizeSubsystem(item));
    }

    return createPage<Subsystem>({
      items,
      total: typeof payload.total === 'number' ? payload.total : undefined,
      limit: typeof payload.limit === 'number' ? payload.limit : filters.limit,
      offset: typeof payload.offset === 'number' ? payload.offset : filters.offset,
    });
  }

  async list(filters: SubsystemListFilters = {}): Promise<Subsystem[]> {
    const page = await this.listPaged(filters);
    return page.items;
  }

  async get(id: string | number): Promise<Subsystem | null> {
    const response = await this.http.request<Subsystem | null>({
      path: `/api/subsystems/${id}`,
      acceptStatuses: [404],
    });
    if (response.status === 404 || response.data == null) return null;
    return normalizeSubsystem(response.data);
  }

  async create(payload: Record<string, unknown>): Promise<Subsystem> {
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

    const response = await this.http.request<Subsystem>({
      path: '/api/subsystems',
      method: 'POST',
      json: outPayload,
    });
    return normalizeSubsystem(response.data);
  }

  async update(id: string | number, payload: Record<string, unknown>): Promise<Subsystem> {
    const response = await this.http.request<Subsystem>({
      path: `/api/subsystems/${id}`,
      method: 'PUT',
      json: payload,
    });
    return normalizeSubsystem(response.data);
  }

  async remove(id: string | number): Promise<void> {
    await this.http.request({
      path: `/api/subsystems/${id}`,
      method: 'DELETE',
      parse: 'none',
      acceptStatuses: [404],
    });
  }

  async listMembers(id: string | number): Promise<SubsystemMember[]> {
    const response = await this.http.request<SubsystemMember[]>({
      path: `/api/subsystems/${id}/members`,
    });
    return Array.isArray(response.data) ? response.data.map((item) => normalizeSubsystemMember(item)) : [];
  }

  async toggleLeader(id: string | number, alterId: string | number, add = true): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: `/api/subsystems/${id}/leaders/toggle`,
      method: 'POST',
      json: { alter_id: alterId, add },
    });
    return isRecord(response.data) ? response.data : {};
  }

  async setMemberRoles(id: string | number, alterId: string | number, roles: unknown): Promise<void> {
    await this.http.request({
      path: `/api/subsystems/${id}/members/roles`,
      method: 'POST',
      json: { alter_id: alterId, roles },
      parse: 'none',
    });
  }

  async downloadPdf(id: string | number): Promise<Response> {
    const response = await this.http.request({
      path: `/api/pdf/subsystem/${id}`,
      parse: 'none',
    });
    return response.raw;
  }

  async migrateAlterAssignments(): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/admin/migrate-alter-subsystems',
      method: 'POST',
    });
    return isRecord(response.data) ? response.data : {};
  }
}
