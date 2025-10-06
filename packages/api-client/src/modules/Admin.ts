import { HttpClient } from '../core/HttpClient';
import type {
  UpdateStatus,
  UpdateResult,
  UpdateCheckQuery,
  AuditLogEntry,
  AuditLogResponse,
  SystemRequest,
  SystemRequestAdmin,
  AdminSettings,
  HousekeepingJob,
  HousekeepingRun,
  DatabaseQueryRequest,
  DatabaseQueryResponse,
} from '../Types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface AuditLogFilters {
  page?: number;
  perPage?: number;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
}

export interface AdminAuditExportResult {
  status: number;
  ok: boolean;
  content: string;
  contentType: string;
}

export interface AdminMessageResult {
  success?: boolean;
  message?: string;
}

export class AdminApi {
  constructor(private readonly http: HttpClient) {}

  async resetUserPassword(id: string | number, password: string): Promise<AdminMessageResult> {
    const response = await this.http.request<Record<string, unknown>>({
      path: `/api/users/${id}/reset`,
      method: 'POST',
      json: { password },
    });
    const payload = isRecord(response.data) ? response.data : {};
    return {
      success: typeof payload.success === 'boolean' ? payload.success : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  async disableUser(id: string | number): Promise<void> {
    const randomPassword = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await this.resetUserPassword(id, randomPassword);
    await this.http.request({
      path: `/api/users/${id}`,
      method: 'PUT',
      json: { is_approved: false },
      parse: 'none',
    });
  }

  async auditLogs(filters: AuditLogFilters = {}): Promise<AuditLogResponse> {
    const params = new URLSearchParams();
    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 200;
    const offset = (page - 1) * perPage;

    params.set('limit', String(perPage));
    params.set('offset', String(offset));

    if (filters.action) params.set('action', filters.action);
    if (typeof filters.userId === 'number') params.set('user_id', String(filters.userId));
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);

    const response = await this.http.request<AuditLogResponse | AuditLogEntry[]>({
      path: '/api/audit',
      query: Object.fromEntries(params.entries()),
    });

    if (Array.isArray(response.data)) {
      return { items: response.data };
    }

    if (isRecord(response.data) && Array.isArray((response.data as { items?: unknown[] }).items)) {
      const payload = response.data as AuditLogResponse;
      return {
        items: payload.items,
        total: typeof payload.total === 'number' ? payload.total : payload.items.length,
      };
    }

    return { items: [] };
  }

  async exportAuditCsv(): Promise<AdminAuditExportResult> {
    const response = await this.http.request<string>({
      path: '/api/audit/export',
      parse: 'text',
      throwOnError: false,
    });

    return {
      status: response.status,
      ok: response.ok,
      content: response.data ?? '',
      contentType: response.headers.get('content-type') ?? 'text/csv',
    };
  }

  async clearAuditLogs(): Promise<AdminMessageResult> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/audit/clear',
      method: 'POST',
    });
    const payload = isRecord(response.data) ? response.data : {};
    return {
      success: typeof payload.success === 'boolean' ? payload.success : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  async requestSystemApproval(): Promise<SystemRequest | null> {
    const response = await this.http.request<SystemRequest | null>({
      path: '/api/me/request-system',
      method: 'POST',
      acceptStatuses: [400, 409],
    });
    return response.data ?? null;
  }

  async mySystemRequest(): Promise<SystemRequest | null> {
    const response = await this.http.request<SystemRequest | null>({
      path: '/api/me/request-system',
      acceptStatuses: [404],
    });
    if (response.status === 404) return null;
    return response.data ?? null;
  }

  async listSystemRequests(): Promise<SystemRequestAdmin[]> {
    const response = await this.http.request<SystemRequestAdmin[]>({
      path: '/api/system-requests',
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async decideSystemRequest(id: string | number, status: unknown): Promise<AdminMessageResult> {
    const response = await this.http.request<Record<string, unknown>>({
      path: `/api/system-requests/${encodeURIComponent(String(id))}/decide`,
      method: 'POST',
      json: { status },
    });
    const payload = isRecord(response.data) ? response.data : {};
    return {
      success: typeof payload.success === 'boolean' ? payload.success : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  async settings(): Promise<AdminSettings> {
    const response = await this.http.request<AdminSettings>({
      path: '/api/settings',
    });
    return isRecord(response.data) ? (response.data as AdminSettings) : {};
  }

  async getSetting(key: string): Promise<unknown> {
    const response = await this.http.request<unknown>({
      path: `/api/settings/${encodeURIComponent(key)}`,
      acceptStatuses: [404],
    });
    if (response.status === 404) return null;
    return response.data ?? null;
  }

  async redisStatus(): Promise<{ ok: boolean; error?: string; info?: Record<string, unknown> }> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/admin/redis',
      throwOnError: false,
    });
    const payload = isRecord(response.data) ? response.data : {};
    return {
      ok: Boolean(payload.ok),
      error: typeof payload.error === 'string' ? payload.error : undefined,
      info: isRecord(payload.info) ? (payload.info as Record<string, unknown>) : undefined,
    };
  }

  async updateSettings(payload: AdminSettings): Promise<AdminMessageResult> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/settings',
      method: 'PUT',
      json: payload,
    });
    const body = isRecord(response.data) ? response.data : {};
    return {
      success: typeof body.success === 'boolean' ? body.success : undefined,
      message: typeof body.message === 'string' ? body.message : undefined,
    };
  }

  async postDiscordBirthdays(): Promise<{ status: number; error: string }> {
    return { status: 404, error: 'not_implemented' };
  }

  async posts(page = 1, perPage = 50): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/posts',
      query: { page, per_page: perPage },
    });
    return isRecord(response.data) ? response.data : {};
  }

  async repostPost(id: string | number): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: `/api/posts/${encodeURIComponent(String(id))}/repost`,
      method: 'POST',
    });
    return isRecord(response.data) ? response.data : {};
  }

  async listHousekeepingJobs(): Promise<{ jobs: HousekeepingJob[] }> {
    const response = await this.http.request<{ jobs?: unknown }>({
      path: '/api/housekeeping/jobs',
    });
    const jobs =
      isRecord(response.data) && Array.isArray((response.data as { jobs?: unknown }).jobs)
        ? ((response.data as { jobs?: unknown }).jobs as HousekeepingJob[])
        : [];
    return { jobs };
  }

  async triggerHousekeepingJob(name: string, options: { dry?: boolean } = {}): Promise<HousekeepingRun> {
    const response = await this.http.request<HousekeepingRun>({
      path: `/api/housekeeping/trigger/${encodeURIComponent(name)}`,
      method: 'POST',
      json: typeof options.dry !== 'undefined' ? { dry: !!options.dry } : undefined,
    });
    const fallback: HousekeepingRun = {
      id: -1,
      job_name: name,
      started_at: new Date().toISOString(),
      status: 'failed',
      dry_run: !!options.dry,
    };
    return isRecord(response.data) ? (response.data as HousekeepingRun) : fallback;
  }

  async listHousekeepingRuns(page = 1, perPage = 100): Promise<{ runs: HousekeepingRun[] }> {
    const limit = perPage;
    const offset = (page - 1) * perPage;
    const response = await this.http.request<{ runs?: unknown[] }>({
      path: '/api/housekeeping/runs',
      query: { limit, offset },
    });
    const runs = Array.isArray(response.data?.runs) ? (response.data?.runs as HousekeepingRun[]) : [];
    return { runs };
  }

  async clearHousekeepingRuns(): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/housekeeping/runs',
      method: 'POST',
    });
    return isRecord(response.data) ? response.data : {};
  }

  async reloadUploadDirectory(): Promise<Record<string, unknown>> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/admin/reload-upload-dir',
      method: 'POST',
    });
    return isRecord(response.data) ? response.data : {};
  }

  async updateStatus(): Promise<UpdateStatus> {
    const response = await this.http.request<UpdateStatus>({
      path: '/api/admin/update/check',
      throwOnError: false,
    });
    const fallback: UpdateStatus = {
      available: false,
      current_version: 'unknown',
      message: 'Failed to check for updates',
      versions: {
        server: 'unknown',
        db: 'unknown',
        auth: 'unknown',
        cache: 'unknown',
        error: 'unknown',
        config: 'unknown',
        oidc: 'unknown',
        metrics: 'unknown',
        housekeeping: 'unknown',
        middleware: 'unknown',
        updater: 'unknown',
        migrations: 'unknown',
        frontend: 'unknown',
      },
    };
    return response.data ?? fallback;
  }

  async performUpdate(options: UpdateCheckQuery = {}): Promise<UpdateResult> {
    const query: Record<string, string> = {};
    if (options.check_only) query.check_only = 'true';

    const response = await this.http.request<UpdateResult>({
      path: '/api/admin/update',
      method: 'POST',
      query: Object.keys(query).length ? query : undefined,
    });
    return response.data ?? { success: false, message: 'Failed to perform update' };
  }

  async postCustomDigest(daysAhead?: number): Promise<CustomDigestResponse> {
    const query: Record<string, string> = {};
    if (typeof daysAhead === 'number') query.days_ahead = String(daysAhead);

    const response = await this.http.request<CustomDigestResponse>({
      path: '/api/admin/digest/custom',
      method: 'POST',
      query: Object.keys(query).length ? query : undefined,
    });
    return response.data ?? { posted: false, count: 0, message: 'Failed to post custom digest' };
  }

  async queryDatabase(request: DatabaseQueryRequest): Promise<DatabaseQueryResponse> {
    const response = await this.http.request<DatabaseQueryResponse>({
      path: '/api/admin/db/query',
      method: 'POST',
      json: request,
    });
    return response.data ?? { success: false, columns: [], rows: [], row_count: 0, message: 'Query failed' };
  }

  async getMetrics(): Promise<string> {
    const response = await this.http.request<string>({
      path: '/api/metrics',
      method: 'GET',
      parse: 'text',
      auth: true,
    });
    return response.data;
  }
}

export interface CustomDigestResponse {
  posted: boolean;
  count: number;
  message: string;
}
