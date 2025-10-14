import {
  AdminGetAuditRequest,
  ApiAuditLogResponse,
  ApiJsonValue,
  apiClient,
  AdminGetOidcByIdSecretRequest,
  AdminPostOidcByIdSecretRequest,
  ApiProviderAdminView,
  ApiUpdateSecretBody,
  AdminGetUploadsRequest,
  AdminGetUsersByIdRequest,
  AdminGetUsersRequest,
  AdminDeleteUploadsByNameRequest,
  AdminPutUsersByIdRequest,
  AdminPostUsersRequest,
  ApiCreateUserPayload,
  ApiUpdateUserPayload,
  AdminGetSystemRequestsRequest,
  AdminPostSystemRequestsRequest,
  AdminGetAdminUpdateCheckRequest,
  AdminPostAdminUpdateRequest,
  AdminGetSettingsByKeyRequest,
  AdminPostUploadsPurgeRequest,
  AdminGetMetricsRequest,
  AdminPostAdminDigestCustomRequest,
  AdminGetHousekeepingJobsRequest,
  AdminGetHousekeepingRunsRequest,
  AdminPostHousekeepingRunsRequest,
  AdminPostHousekeepingTriggerByNameRequest,
  AdminPostAdminDbQueryRequest,
  AdminGetSettingsRequest,
  AdminPutSettingsRequest,
  AdminGetAdminRedisRequest,
  AdminPostAdminUploadDirRequest,
  AdminPostAdminBackupRequest,
  AdminPostAdminRestoreRequest,
  AdminGetUsersRequest as AdminGetUsersCountRequest,
  AdminPostAuditPurgeRequest,
  ApiDecisionBody,
  ApiQueryRequest,
  ApiTriggerRequest,
  ApiClearRunsBody,
  ApiPurgeBody,
  ApiUpsertBody,
  ApiDigestResponse,
  ApiUser,
  ReportGetPdfAlterByIdRequest,
  ReportGetPdfGroupByIdRequest,
  ReportGetPdfSubsystemByIdRequest,
} from '@didhub/api-client';

// Local typed extension for non-generated admin helper methods
type AdminExtras = {
  resetUserPassword: (id: string, password: string) => Promise<unknown>;
  disableUser: (id: string) => Promise<unknown>;
  posts: (page: number, perPage: number) => Promise<unknown>;
  postDiscordBirthdays: () => Promise<unknown>;
  repostPost: (id: string) => Promise<unknown>;
};

const adminExt = apiClient.admin as unknown as (typeof apiClient.admin & AdminExtras);

export async function getUploads(params: AdminGetUploadsRequest) {
  const req: AdminGetUploadsRequest = params;
  const resp = await apiClient.admin.get_uploads(req);
  return resp.data ?? null;
}

export async function getUsersById(id: string) {
  const req: AdminGetUsersByIdRequest = { id };
  const resp = await apiClient.admin.get_users_by_id(req);
  return resp.data ?? null;
}

export async function listUsers(params: AdminGetUsersRequest) {
  const req: AdminGetUsersRequest = params;
  const resp = await apiClient.admin.get_users(req);
  return resp.data ?? null;
}

// PDF/report helpers
export async function getPdfAlterById(id: string) {
  const req: ReportGetPdfAlterByIdRequest = { id };
  const resp = await apiClient.report.get_pdf_alter_by_id(req);
  return resp?.data ?? null
}

export async function getPdfGroupById(id: string) {
  const req: ReportGetPdfGroupByIdRequest = { id };
  const resp = await apiClient.report.get_pdf_group_by_id(req);
  return resp?.data ?? null
}

export async function getPdfSubsystemById(id: string) {
  const req: ReportGetPdfSubsystemByIdRequest = { id };
  const resp = await apiClient.report.get_pdf_subsystem_by_id(req);
  return resp?.data ?? null
}

export async function deleteUpload(name: string, force = false) {
  const req: AdminDeleteUploadsByNameRequest = { name, force };
  const resp = await apiClient.admin.delete_uploads_by_name(req);
  return resp?.data ?? null
}

export async function updateUser(id: string, payload: ApiUpdateUserPayload) {
  const req: AdminPutUsersByIdRequest = { id, body: payload };
  const resp = await apiClient.admin.put_users_by_id(req);
  return resp?.data ?? null
}

export async function resetUserPassword(id: string, password: string) {
  // some tests expect a simple object back; return whatever the generator returns
  const resp = await adminExt.resetUserPassword(id, password);
  return resp ?? null
}

export async function disableUser(id: string) {
  const resp = await adminExt.disableUser(id);
  return resp ?? null
}

export async function createUser(payload: Record<string, unknown>) {
  const body: ApiCreateUserPayload = payload as unknown as ApiCreateUserPayload;
  const req: AdminPostUsersRequest = { body };
  const resp = await apiClient.admin.post_users(req);
  return resp?.data ?? null
}

export async function getSystemRequests() {
  const req: AdminGetSystemRequestsRequest = {};
  const resp = await apiClient.admin.get_system_requests(req);
  return resp?.data ?? null;
}

export async function decideSystemRequest(id: string, status: string) {
  // Generator exposes post_system_requests which accepts a decision body.
  const body: ApiDecisionBody = { id, approve: status === 'approve' || status === 'approved', note: undefined };
  const req: AdminPostSystemRequestsRequest = { body };
  const resp = await apiClient.admin.post_system_requests(req);
  return resp?.data ?? null
}

export async function checkUpdates() {
  const req: AdminGetAdminUpdateCheckRequest = { check_only: true };
  const resp = await apiClient.admin.get_admin_update_check(req);
  return resp?.data ?? null
}

export async function runUpdate() {
  const req: AdminPostAdminUpdateRequest = { check_only: false, body: {} };
  const resp = await apiClient.admin.post_admin_update(req);
  return resp?.data ?? null
}

export async function getSettingsByKey(key: string) {
  const req: AdminGetSettingsByKeyRequest = { key };
  const resp = await apiClient.admin.get_settings_by_key(req);
  return resp?.data ?? null
}

export async function postUploadsPurge(payload: AdminPostUploadsPurgeRequest) {
  const req: AdminPostUploadsPurgeRequest = payload;
  const resp = await apiClient.admin.post_uploads_purge(req);
  return resp?.data ?? null
}

// Additional convenience wrappers used by admin UI
export async function getMetrics() {
  const req: AdminGetMetricsRequest = {};
  const resp = await apiClient.admin.get_metrics(req);
  return resp?.data ?? null;
}

export async function posts(page = 1, perPage = 20) {
  const resp = await adminExt.posts(page, perPage);
  return resp ?? null
}

export async function postDiscordBirthdays() {
  const resp = await adminExt.postDiscordBirthdays();
  return resp ?? null
}

export async function postCustomDigest(daysAhead: number) {
  const req: AdminPostAdminDigestCustomRequest = { days_ahead: daysAhead, body: {} };
  const resp = await apiClient.admin.post_admin_digest_custom(req);
  return resp?.data ?? null
}

export async function repostPost(id: string) {
  const resp = await adminExt.repostPost(id);
  return resp ?? null
}

export async function getHousekeepingJobs() {
  const req: AdminGetHousekeepingJobsRequest = {};
  const resp = await apiClient.admin.get_housekeeping_jobs(req);
  return resp?.data ?? null
}

export async function getHousekeepingRuns(page = 1, perPage = 50) {
  const req: AdminGetHousekeepingRunsRequest = { limit: perPage, offset: (page - 1) * perPage };
  const resp = await apiClient.admin.get_housekeeping_runs(req);
  return resp?.data ?? null;
}

export async function postHousekeepingTriggerByName(name: string, opts?: { dry?: boolean }) {
  const body: ApiTriggerRequest = { dry: !!opts?.dry };
  const req: AdminPostHousekeepingTriggerByNameRequest = { name, body };
  const resp = await apiClient.admin.post_housekeeping_trigger_by_name(req);
  return resp?.data ?? null;
}

export async function clearHousekeepingRuns() {
  const req: AdminPostHousekeepingRunsRequest = { body: {} };
  const resp = await apiClient.admin.post_housekeeping_runs(req);
  return resp?.data ?? null;
}

export async function postAdminDbQuery(body: { sql: string; limit?: number }) {
  const q: ApiQueryRequest = body as ApiQueryRequest;
  const req: AdminPostAdminDbQueryRequest = { body: q };
  const resp = await apiClient.admin.post_admin_db_query(req);
  return resp?.data ?? null;
}

export async function getSettings() {
  const req: AdminGetSettingsRequest = {};
  const resp = await apiClient.admin.get_settings(req);
  return resp?.data ?? null;
}

export async function putSettings(payload: Record<string, unknown>) {
  const req: AdminPutSettingsRequest = { body: payload as unknown as unknown as ApiJsonValue };
  const resp = await apiClient.admin.put_settings(req);
  return resp?.data ?? null;
}

export async function getAdminRedis() {
  const req: AdminGetAdminRedisRequest = {};
  const resp = await apiClient.admin.get_admin_redis(req);
  return resp?.data ?? resp ?? null;
}

export async function postAdminReloadUploadDir() {
  const req: AdminPostAdminUploadDirRequest = { action: 'reload', body: {} };
  const resp = await apiClient.admin.post_admin_upload_dir(req);
  return resp?.data ?? null;
}

export async function postAdminBackup(file?: File) {
  // If file provided, call restore; otherwise create backup
  if (file) {
    const restoreReq: AdminPostAdminRestoreRequest = { body: file };
    const resp = await apiClient.admin.post_admin_restore(restoreReq);
    return resp?.data ?? null;
  }
  const req: AdminPostAdminBackupRequest = { body: {} };
  const resp = await apiClient.admin.post_admin_backup(req);
  return resp?.data ?? null;
}

export async function getOidcSecret(provider: string): Promise<ApiProviderAdminView | null> {
  const req: AdminGetOidcByIdSecretRequest = { id: provider };
  const resp = await apiClient.admin.get_oidc_by_id_secret(req);
  return (resp && 'data' in resp) ? (resp.data as ApiProviderAdminView) : null;
}

export async function updateOidcSecret(
  provider: string,
  body: ApiUpdateSecretBody,
): Promise<ApiProviderAdminView | null> {
  const req: AdminPostOidcByIdSecretRequest = { id: provider, body };
  const resp = await apiClient.admin.post_oidc_by_id_secret(req);
  return (resp && 'data' in resp) ? (resp.data as ApiProviderAdminView) : null;
}

export async function getUsersCount(params?: Record<string, unknown>) {
  const resp = await apiClient.admin.get_users(params ?? {});
  return resp?.data ?? null;
}

export async function getAudit(params?: AdminGetAuditRequest): Promise<ApiAuditLogResponse[] | null> {
  const req: AdminGetAuditRequest = params ?? {};
  const resp = await apiClient.admin.get_audit(req);
  return resp?.data ?? null;
}

export async function exportAuditCsv() {
  // Backend route not available; build CSV client-side from getAudit
  const respTyped: ApiAuditLogResponse[] | null = await getAudit({ limit: 1000 });
  const rows = respTyped ?? [];

  // If no rows, return null
  if (!rows || rows.length === 0) return null;

  // Determine CSV headers from keys of first row (preserve order)
  const headers = Object.keys(rows[0]);

  // Helper to escape CSV values
  const esc = (val: unknown) => {
    if (val === null || val === undefined) return '';
    const s = typeof val === 'string' ? val : String(val);
    // If contains quote, comma, or newline, wrap in quotes and escape quotes
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [] as string[];
  lines.push(headers.join(','));
  for (const r of rows) {
    const line = headers.map((h) => esc((r as ApiAuditLogResponse)[h])).join(',');
    lines.push(line);
  }

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

  // Try to trigger a download when running in browser
  try {
    if (typeof window !== 'undefined' && 'document' in window) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `didhub-audit-${ts}.csv`;
      // Append, click, and remove to trigger
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Release object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch (e) {
    // ignore if not running in browser environment
  }

  return blob;
}

export async function clearAuditLogs() {
  const resp = await apiClient.admin.post_audit_purge({ body: { } });
  return resp?.data ?? null
}
