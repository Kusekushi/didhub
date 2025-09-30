import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import type { UploadInfo } from '../Types';
import { getStoredToken, readCsrfToken } from '../utils/storage';

export interface FileUploadResult {
  status: number;
  url?: string | null;
  payload?: UploadJsonPayload | null;
  text?: string | null;
}

export interface UploadJsonPayload {
  filename?: string;
  url?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface AvatarResponsePayload extends UploadJsonPayload {
  avatar?: string;
}

export interface DeleteAvatarResponse {
  success?: boolean;
  message?: string;
}

const uploadUrl = '/api/upload';

export class FilesApi {
  constructor(private readonly http: HttpClient) {}

  async upload(file: File): Promise<FileUploadResult> {
    const body = new FormData();
    body.append('file', file);
    const response = await this.http.request<UploadJsonPayload>({
      path: uploadUrl,
      method: 'POST',
      body,
    });

    const payload = response.data ?? null;
    const url =
      typeof payload?.filename === 'string' ? payload.filename : typeof payload?.url === 'string' ? payload.url : null;

    return {
      status: response.status,
      url,
      payload,
      text: response.text ?? null,
    };
  }

  uploadWithProgress(file: File, onProgress: (percentage: number) => void): Promise<FileUploadResult> {
    return new Promise((resolve) => {
      const body = new FormData();
      body.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.withCredentials = true;

      const token = getStoredToken();
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      const csrf = readCsrfToken();
      if (csrf) xhr.setRequestHeader('x-csrf-token', csrf);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress(pct);
      };

      xhr.onerror = () => {
        resolve({ status: xhr.status || 0, payload: { error: 'upload_failed' }, text: xhr.responseText ?? null });
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        let payload: UploadJsonPayload | null = null;
        try {
          payload = xhr.responseText ? (JSON.parse(xhr.responseText) as UploadJsonPayload) : null;
        } catch {
          payload = null;
        }

        const url =
          typeof payload?.filename === 'string'
            ? payload.filename
            : typeof payload?.url === 'string'
              ? payload.url
              : null;

        resolve({
          status: xhr.status,
          url,
          payload,
          text: xhr.responseText ?? null,
        });
      };

      xhr.send(body);
    });
  }

  async uploadAvatar(file: File): Promise<{ url?: string; message?: string; error?: string }> {
    const body = new FormData();
    body.append('file', file);
    const response = await this.http.request<AvatarResponsePayload>({
      path: '/api/me/avatar',
      method: 'POST',
      body,
    });

    const payload = response.data ?? null;
    if (payload && (typeof payload.url === 'string' || typeof payload.filename === 'string')) {
      const url = typeof payload.url === 'string' ? payload.url : payload.filename;
      const message = typeof payload.message === 'string' ? payload.message : undefined;
      return { url, message };
    }

    return {
      error: typeof payload?.error === 'string' ? payload.error : 'upload_failed',
      message: typeof payload?.message === 'string' ? payload.message : undefined,
    };
  }

  async deleteAvatar(): Promise<DeleteAvatarResponse | null> {
    const response = await this.http.request<DeleteAvatarResponse | null>({
      path: '/api/me/avatar',
      method: 'DELETE',
      acceptStatuses: [404],
    });
    return response.data ?? null;
  }

  async list(params: Record<string, unknown> = {}): Promise<Page<UploadInfo>> {
    const query: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      query[key] = String(value);
    });

    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/uploads',
      query: Object.keys(query).length ? query : undefined,
    });

    const payload = response.data ?? {};
    const items = Array.isArray((payload as { items?: unknown[] }).items)
      ? ((payload as { items?: unknown[] }).items as UploadInfo[])
      : [];

    return createPage<UploadInfo>({
      items,
      total:
        typeof (payload as { total?: number }).total === 'number' ? (payload as { total?: number }).total : undefined,
      limit:
        typeof (payload as { limit?: number }).limit === 'number' ? (payload as { limit?: number }).limit : undefined,
      offset:
        typeof (payload as { offset?: number }).offset === 'number'
          ? (payload as { offset?: number }).offset
          : undefined,
    });
  }

  async delete(name: string, force = false): Promise<void> {
    await this.http.request({
      path: `/api/uploads/${encodeURIComponent(name)}`,
      method: 'DELETE',
      query: force ? { force: '1' } : undefined,
      parse: 'none',
      acceptStatuses: [404],
    });
  }

  async purge(
    options: { purgeBefore?: string; force?: boolean } = {},
  ): Promise<{ deleted?: number; message?: string }> {
    const query: Record<string, string> = {};
    if (options.purgeBefore) query.purge_before = options.purgeBefore;
    if (options.force) query.force = '1';

    const response = await this.http.request<{ deleted?: number; message?: string }>({
      path: '/api/uploads/purge',
      method: 'POST',
      query: Object.keys(query).length ? query : undefined,
    });

    return response.data ?? {};
  }
}
