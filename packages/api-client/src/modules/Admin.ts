import { apiFetch, ApiFetchResult } from '../Util';
import { updateUser } from './User';
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
} from '../Types';

export async function adminResetUserPassword(id: string | number, password: string): Promise<{ success?: boolean; message?: string }> {
  return apiFetch('/api/users/' + id + '/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then((r: ApiFetchResult) => r.json || {});
}

export async function adminDisableUser(id: string | number): Promise<ApiFetchResult> {
  const rnd = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await adminResetUserPassword(id, rnd);
  return updateUser(id, { is_approved: false });
}

export async function fetchAuditLogs(
  options: {
    page?: number;
    per_page?: number;
    action?: string;
    user_id?: number;
    from?: string;
    to?: string;
  } = {},
): Promise<AuditLogResponse> {
  const params = new URLSearchParams();

  // Add pagination params (legacy support)
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.per_page !== undefined) params.set('per_page', String(options.per_page));

  // Add filtering params
  if (options.action) params.set('action', options.action);
  if (options.user_id !== undefined) params.set('user_id', String(options.user_id));
  if (options.from) params.set('from', options.from);
  if (options.to) params.set('to', options.to);

  // Convert pagination to limit/offset for the API
  const page = options.page || 1;
  const per_page = options.per_page || 200;
  const limit = per_page;
  const offset = (page - 1) * per_page;

  params.set('limit', String(limit));
  params.set('offset', String(offset));

  return apiFetch<AuditLogResponse | AuditLogEntry[]>(`/api/audit?${params.toString()}`).then((r) => {
    const j = r.json ?? { items: [] };
    // Normalize: server may return a raw array or an object with `items`.
    if (Array.isArray(j)) {
      return { items: j } as AuditLogResponse;
    }
    return j;
  });
}

export async function exportAdminAuditCsv(): Promise<ApiFetchResult> {
  return apiFetch('/api/audit/export');
}

export async function clearAuditLogs(): Promise<{ success?: boolean; message?: string }> {
  return apiFetch<{ success?: boolean; message?: string }>('/api/audit/clear', { method: 'POST' }).then((r) => r.json ?? {});
}

export async function requestSystemApproval(): Promise<SystemRequest | null> {
  return apiFetch<SystemRequest | null>('/api/me/request-system', { method: 'POST' }).then((r) => r.json ?? null);
}

export async function getMySystemRequest(): Promise<SystemRequest | null> {
  return apiFetch<SystemRequest | null>('/api/me/request-system').then((r) => r.json ?? null);
}

export async function listSystemRequests(): Promise<SystemRequestAdmin[]> {
  return apiFetch<SystemRequestAdmin[]>('/api/system-requests').then((r) => r.json ?? []);
}

export async function setSystemRequestStatus(
  id: string | number,
  status: unknown,
): Promise<{ success?: boolean; message?: string } | null> {
  return apiFetch<{ success?: boolean; message?: string } | null>(
    '/api/system-requests/' + encodeURIComponent(String(id)) + '/decide',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  ).then((r) => r.json ?? null);
}

export async function getAdminSettings(): Promise<AdminSettings> {
  return apiFetch<AdminSettings>('/api/settings').then((r) => r.json ?? {});
}

export async function getSetting(key: string): Promise<unknown> {
  return apiFetch<unknown>('/api/settings/' + encodeURIComponent(key)).then((r) => r.json ?? null);
}

export async function getRedisStatus(): Promise<{ ok: boolean; error?: string; info?: Record<string, unknown> }> {
  return apiFetch<{ ok: boolean; error?: string; info?: Record<string, unknown> }>('/api/admin/redis').then(
    (r) => r.json ?? { ok: false, error: 'no-response' },
  );
}

export async function updateAdminSettings(payload: AdminSettings): Promise<{ success?: boolean; message?: string }> {
  return apiFetch<{ success?: boolean; message?: string }>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json ?? {});
}

// Discord birthdays endpoint not present in Rust server (placeholder retained)
export async function postDiscordBirthdays(): Promise<{ status: number; error: string }> {
  return { status: 404, error: 'not_implemented' };
}

export async function getAdminPosts(page = 1, per_page = 50): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    '/api/posts?page=' + encodeURIComponent(page) + '&per_page=' + encodeURIComponent(per_page),
  ).then((r) => r.json ?? {});
}

export async function repostAdminPost(id: string | number): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/posts/' + encodeURIComponent(id) + '/repost', {
    method: 'POST',
  }).then((r) => r.json ?? {});
}

export async function listHousekeepingJobs(): Promise<{ jobs: HousekeepingJob[] }> {
  return apiFetch<{ jobs: HousekeepingJob[] }>('/api/housekeeping/jobs').then(
    (r) => r.json ?? { jobs: [] },
  );
}

export async function runHousekeepingJob(name: string, opts?: { dry?: boolean }): Promise<HousekeepingRun> {
  const init: RequestInit = { method: 'POST' };
  if (opts && typeof opts.dry !== 'undefined') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({ dry: !!opts.dry });
  }
  return apiFetch<HousekeepingRun>('/api/housekeeping/trigger/' + encodeURIComponent(name), init).then((r) => {
    const fallback: HousekeepingRun = {
      id: -1,
      job_name: name,
      started_at: new Date().toISOString(),
      status: 'failed',
      dry_run: !!opts?.dry,
    };
    return r.json ?? fallback;
  });
}

export async function listHousekeepingRuns(page = 1, per_page = 100): Promise<{ runs: HousekeepingRun[] }> {
  const limit = per_page;
  const offset = (page - 1) * per_page;
  return apiFetch<{ runs: HousekeepingRun[] }>(
    `/api/housekeeping/runs?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
  ).then((r) => r.json ?? { runs: [] });
}

export async function clearHousekeepingRuns(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/housekeeping/runs', { method: 'POST' }).then((r) => r.json ?? {});
}

export async function reloadUploadDir(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>('/api/admin/reload-upload-dir', { method: 'POST' }).then(
    (r) => r.json ?? {},
  );
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  return apiFetch<UpdateStatus>('/api/admin/update/check').then((r) => {
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
    return r.json ?? fallback;
  });
}

export async function performUpdate(options: UpdateCheckQuery = {}): Promise<UpdateResult> {
  const params = new URLSearchParams();
  if (options.check_only) {
    params.set('check_only', 'true');
  }

  const url = '/api/admin/update' + (params.toString() ? '?' + params.toString() : '');
  return apiFetch<UpdateResult>(url, { method: 'POST' }).then((r) => r.json ?? { success: false, message: 'Failed to perform update' });
}

export interface CustomDigestResponse {
  posted: boolean;
  count: number;
  message: string;
}

export async function postCustomDigest(daysAhead?: number): Promise<CustomDigestResponse> {
  const params = new URLSearchParams();
  if (daysAhead !== undefined) {
    params.set('days_ahead', String(daysAhead));
  }

  const url = '/api/admin/digest/custom' + (params.toString() ? '?' + params.toString() : '');
  return apiFetch<CustomDigestResponse>(url, { method: 'POST' }).then(
    (r) => r.json ?? { posted: false, count: 0, message: 'Failed to post custom digest' },
  );
}
