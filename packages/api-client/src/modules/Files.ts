import { apiFetch, ApiFetchResult } from '../Util';
import type { UploadInfo, UploadListResponse } from '../Types';

function getStoredToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('didhub_jwt');
  } catch {
    return null;
  }
}

function getCsrfToken(): string | null {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
    const m = document.cookie.match('(^|;)\\s*csrf_token=([^;]+)');
    if (m && m.length >= 3) {
      return decodeURIComponent(m[2]);
    }
  } catch {}
  return null;
}

export async function uploadFile(file: File): Promise<{ status: number; json?: any; text?: string | null; url?: string | null }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await apiFetch('/api/upload', { method: 'POST', body: fd });
  return { status: res.status, json: res.json, text: res.text, url: res.json ? res.json.filename : null };
}

// Upload with progress callback (percentage 0-100). Returns same shape as uploadFile.
export function uploadFileWithProgress(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ status: number; json?: any; url?: string; text?: string; error?: string }> {
  return new Promise((resolve) => {
    const fd = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    // Add JWT token if available
    const token = getStoredToken();
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    }

    // Add CSRF token if available
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
      try {
        onProgress(pct);
      } catch {}
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        let parsed: any = undefined;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
        } catch {}
        resolve({
          status: xhr.status,
          json: parsed,
          url: parsed ? parsed.filename : undefined,
          text: xhr.responseText,
        });
      }
    };
    xhr.onerror = () => resolve({ status: xhr.status || 0, error: 'network_error' });
    xhr.send(fd);
  });
}

export async function uploadAvatar(file: File): Promise<{ url?: string; message?: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch('/api/me/avatar', { method: 'POST', body: fd }).then((r: ApiFetchResult) => r.json || null);
}

export async function deleteAvatar(): Promise<{ success?: boolean; message?: string }> {
  return apiFetch('/api/me/avatar', { method: 'DELETE' }).then((r: any) => r.json || null);
}

export async function listUploads(params: Record<string, unknown> = {}): Promise<UploadListResponse> {
  const qs = new URLSearchParams();
  Object.keys(params).forEach((k) => {
    if (params[k] != null) qs.set(k, String(params[k]));
  });
  const q = qs.toString() ? '?' + qs.toString() : '';
  return apiFetch('/api/uploads' + q).then((r: ApiFetchResult) => r.json || {});
}

export async function deleteUpload(name: string, force = false): Promise<ApiFetchResult> {
  return apiFetch(`/api/uploads/${encodeURIComponent(name)}?force=${force ? '1' : '0'}`, { method: 'DELETE' });
}

export async function purgeUploads(opts: { purge_before?: string; force?: boolean } = {}): Promise<{ deleted?: number; message?: string }> {
  const qs = new URLSearchParams();
  if (opts.purge_before) qs.set('purge_before', opts.purge_before);
  if (opts.force) qs.set('force', '1');
  const q = qs.toString() ? '?' + qs.toString() : '';
  return apiFetch('/api/uploads/purge' + q, { method: 'POST' }).then((r: ApiFetchResult) => r.json || {});
}
