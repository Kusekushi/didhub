import { HttpClient } from '../core/HttpClient';
import { safeJsonParse } from '../Util';
import type { Subsystem, SubsystemMember } from '../Types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSubsystem(input: unknown): Subsystem {
  if (!isRecord(input)) return input as Subsystem;
  const subsystem = input as Partial<Subsystem> & Record<string, unknown>;
  return {
    ...subsystem,
    leaders: Array.isArray(subsystem.leaders) ? subsystem.leaders : [],
    metadata: safeJsonParse<unknown>(subsystem.metadata, null),
  } as Subsystem;
}

export interface SubsystemListFilters {
  query?: string;
  ownerUserId?: string | number;
  includeMembers?: boolean;
  rawQuery?: string;
}

export class SubsystemsApi {
  constructor(private readonly http: HttpClient) {}

  async list(filters: SubsystemListFilters = {}): Promise<Subsystem[]> {
    const searchParams = new URLSearchParams(filters.rawQuery ? filters.rawQuery.replace(/^\?/, '') : '');
    if (filters.query) searchParams.set('q', filters.query);
    if (typeof filters.ownerUserId !== 'undefined') searchParams.set('owner_user_id', String(filters.ownerUserId));
    if (filters.includeMembers) searchParams.set('fields', 'members');

    const response = await this.http.request<unknown>({
      path: '/api/subsystems',
      query: Object.fromEntries(searchParams.entries()),
    });

    if (Array.isArray(response.data)) {
      return response.data.map((item) => normalizeSubsystem(item));
    }

    if (isRecord(response.data) && Array.isArray(response.data.items)) {
      return response.data.items.map((item) => normalizeSubsystem(item));
    }

    return [];
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
    const response = await this.http.request<Subsystem>({
      path: '/api/subsystems',
      method: 'POST',
      json: payload,
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
    return Array.isArray(response.data) ? response.data : [];
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

  async migrateAlterAssignments(): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/admin/migrate-alter-subsystems',
      method: 'POST',
    });
    return isRecord(response.data) ? response.data : {};
  }
}
