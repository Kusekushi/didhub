import { apiFetch, setStoredToken, clearStoredToken, ApiFetchResult, hasAuthToken, refreshToken } from '../Util';
import type { User, UserListResponse, UserNamesResponse, UserListOptions, PaginatedResponse } from '../Types';

type LoginResponse = {
  token?: string;
  code?: string;
  error?: string;
};

export async function registerUser(username: string, password: string, is_system = false): Promise<ApiFetchResult> {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, is_system }),
  });
}

export async function loginUser(username: string, password: string): Promise<ApiFetchResult> {
  const r = await apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const token = r.json?.token;
  if (r.status === 200 && token) setStoredToken(token);
  return r;
}

export async function logoutUser(): Promise<{ ok: boolean }> {
  clearStoredToken();
  return { ok: true };
}

export async function listUsers(q?: string, page = 1, per_page = 50, opts: UserListOptions = {}): Promise<UserListResponse> {
  const params: string[] = [];
  if (q) params.push('q=' + encodeURIComponent(q));
  if (page) params.push('page=' + encodeURIComponent(page));
  if (per_page) params.push('per_page=' + encodeURIComponent(per_page));
  if (opts.is_system != null) params.push('is_system=' + (opts.is_system ? '1' : '0'));
  if (opts.is_admin != null) params.push('is_admin=' + (opts.is_admin ? '1' : '0'));
  if (opts.is_approved != null) params.push('is_approved=' + (opts.is_approved ? '1' : '0'));
  if (opts.sort_by) params.push('sort_by=' + encodeURIComponent(opts.sort_by));
  if (opts.order) params.push('order=' + encodeURIComponent(opts.order));
  const qs = params.length ? '?' + params.join('&') : '';
  return apiFetch<UserListResponse>('/api/users' + qs).then((r) => r.json ?? { items: [] });
}

export async function getUser(id: string | number): Promise<User | null> {
  return apiFetch<User | null>('/api/users/' + id).then((r) => r.json ?? null);
}

export async function fetchMeVerified(): Promise<User | null> {
  if (!hasAuthToken()) return null;
  const r = await apiFetch<User | null>('/api/me');
  if (r.status !== 200) return null;
  return r.json ?? null;
}

export async function fetchMe(): Promise<User | { ok: false; status: number }> {
  const r = await apiFetch<User | null>('/api/me');
  if (r.status !== 200) return { ok: false, status: r.status };
  return r.json ?? { ok: false, status: r.status };
}

export async function updateUser(id: string | number, payload: Record<string, unknown>): Promise<ApiFetchResult> {
  return apiFetch('/api/users/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listSystems(): Promise<User[]> {
  return apiFetch<PaginatedResponse<User>>('/api/systems?per_page=100')
    .then((r) => r.json ?? { items: [] })
    .then((j) => (Array.isArray(j.items) ? j.items : []));
}

export async function refreshSession(): Promise<{ ok: boolean; token?: string }> {
  return refreshToken();
}

export async function changePassword(current: string, next: string): Promise<ApiFetchResult> {
  return apiFetch('/api/me/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
}

export async function fetchUserNames(q = ''): Promise<UserNamesResponse> {
  return apiFetch<UserNamesResponse>('/api/users/names' + (q ? '?q=' + encodeURIComponent(q) : '')).then(
    (r) => r.json ?? ({} as UserNamesResponse),
  );
}
