export interface ApiFetchResult<T = any> {
  status: number;
  url?: string;
  contentType?: string | null;
  json?: T | any | null;
  text?: string | null;
}

export type ApiFetchResultError = {
  status: number;
};

function getStoredToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('didhub_jwt');
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, opts: Record<string, any> = {}): Promise<ApiFetchResult> {
  const defaultOpts: Record<string, any> = { credentials: 'include', cache: 'no-store' };
  const merged: Record<string, any> = Object.assign({}, defaultOpts, opts || {});
  // Inject Authorization bearer header for API calls if not explicitly provided
  if (typeof path === 'string' && path.startsWith('/api')) {
    const token = getStoredToken();
    const headers = (merged.headers = merged.headers || {});
    if (token && !('Authorization' in headers)) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    // For mutating requests, include CSRF token from cookie if present and header not provided.
    try {
      const method = (merged.method || 'GET').toString().toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        const headersLocal = merged.headers as Record<string, any>;
        const hasCsrfHeader = Object.keys(headersLocal || {}).some((k) => k.toLowerCase() === 'x-csrf-token');
        if (!hasCsrfHeader && typeof document !== 'undefined' && typeof document.cookie === 'string') {
          const m = document.cookie.match('(^|;)\\s*csrf_token=([^;]+)');
          if (m && m.length >= 3) {
            headersLocal['x-csrf-token'] = decodeURIComponent(m[2]);
          }
        }
      }
    } catch (e) {}
  }
  const res = await fetch(path, merged);
  const txt = await res.text();
  const contentType =
    res.headers && typeof (res.headers as unknown as { get?: Function }).get === 'function'
      ? (res.headers as any).get('content-type')
      : null;
  const meta: ApiFetchResult = { status: res.status, url: res.url, contentType };
  try {
    const parsed = txt ? JSON.parse(txt) : null;
    if (parsed && parsed.code === 'must_change_password') {
      try {
        window.dispatchEvent(new CustomEvent('didhub:must-change-password'));
      } catch {}
    }
    if (res.status === 401) {
      try {
        window.dispatchEvent(new CustomEvent('didhub:unauthorized'));
      } catch {}
    }
    return Object.assign(meta, { json: parsed });
  } catch (e) {
    if (res.status === 401) {
      try {
        window.dispatchEvent(new CustomEvent('didhub:unauthorized'));
      } catch {}
    }
    return Object.assign(meta, { text: txt });
  }
}

export function clearStoredToken() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('didhub_jwt');
  } catch {}
}

export function setStoredToken(token: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('didhub_jwt', token);
  } catch {}
}

export function getTokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp === 'number') return payload.exp;
    return null;
  } catch {
    return null;
  }
}

export async function refreshToken(): Promise<{ ok: boolean; token?: string }> {
  const token = getStoredToken();
  if (!token) return { ok: false };
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return { ok: false };
  try {
    const json = await res.json();
    if (json && json.token) {
      setStoredToken(json.token);
      return { ok: true, token: json.token };
    }
  } catch {}
  return { ok: false };
}

export function hasAuthToken(): boolean {
  return !!getStoredToken();
}

export function safeJsonParse<T = unknown>(v: unknown, fallback: T | null = null): T | null {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v as unknown as T;
  try {
    return JSON.parse(v as string) as T;
  } catch (e) {
    return fallback;
  }
}

export function parseRoles(v: unknown): string[] {
  try {
    if (!v) return [];
    if (Array.isArray(v))
      return (v as any[])
        .map((x) => (x === null || x === undefined ? '' : String(x)))
        .map((s) => s.trim())
        .filter(Boolean);
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.startsWith('[') && s.endsWith(']')) {
        try {
          const p = JSON.parse(s);
          if (Array.isArray(p)) return p;
        } catch (e) {}
      }
      return s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  } catch (e) {
    return [];
  }
}
