import { getStoredToken, setStoredToken } from './utils/storage';

export { getStoredToken, setStoredToken, clearStoredToken, hasAuthToken } from './utils/storage';

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
      return v
        .map((x) => (x === null || x === undefined ? '' : String(x)))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (typeof v === 'string') {
      const s = v.trim();
      if (s.startsWith('[') && s.endsWith(']')) {
        try {
          const p = JSON.parse(s);
          if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter((x) => x.length > 0);
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
