import { HttpClient } from '../core/HttpClient';
import { createPage, Page } from '../core/Pagination';
import type { User, UserNamesResponse, UserListOptions } from '../Types';
import { clearStoredToken, getStoredToken, hasAuthToken, setStoredToken } from '../utils/storage';
import { refreshToken } from '../Util';

export interface LoginResponse {
  token?: string;
  code?: string;
  error?: string;
}

export interface RegisterResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export interface SessionResult {
  status: number;
  ok: boolean;
  user: User | null;
}

export interface UserListFilters extends UserListOptions {
  query?: string;
  page?: number;
  perPage?: number;
}

export class UsersApi {
  constructor(private readonly http: HttpClient) {}

  async register(
    username: string,
    password: string,
    isSystem = false,
  ): Promise<RegisterResponse & { status: number; ok: boolean }> {
    const response = await this.http.request<RegisterResponse>({
      path: '/api/auth/register',
      method: 'POST',
      json: { username, password, is_system: isSystem },
      throwOnError: false,
    });
    const payload = response.data ?? {};
    return {
      ...payload,
      status: response.status,
      ok: response.ok,
    };
  }

  async login(username: string, password: string): Promise<{ status: number; ok: boolean; data: LoginResponse }> {
    const response = await this.http.request<LoginResponse>({
      path: '/api/auth/login',
      method: 'POST',
      json: { username, password },
      throwOnError: false,
    });

    const payload = response.data ?? {};
    if (response.ok && payload.token) {
      setStoredToken(payload.token);
    }

    return {
      status: response.status,
      ok: response.ok,
      data: payload,
    };
  }

  async logout(): Promise<void> {
    clearStoredToken();
  }

  async list(filters: UserListFilters = {}): Promise<Page<User>> {
    const query: Record<string, string> = {};
    if (filters.query) query.q = filters.query;
    if (typeof filters.page === 'number') query.page = String(filters.page);
    if (typeof filters.perPage === 'number') query.per_page = String(filters.perPage);
    if (typeof filters.is_admin === 'boolean') query.is_admin = filters.is_admin ? '1' : '0';
    if (typeof filters.is_system === 'boolean') query.is_system = filters.is_system ? '1' : '0';
    if (typeof filters.is_approved === 'boolean') query.is_approved = filters.is_approved ? '1' : '0';
    if (filters.sort_by) query.sort_by = filters.sort_by;
    if (filters.order) query.order = filters.order;

    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/users',
      query: Object.keys(query).length ? query : undefined,
    });

    const data = response.data ?? {};
    const items = Array.isArray((data as { items?: unknown[] }).items)
      ? ((data as { items?: unknown[] }).items as User[])
      : [];

    return createPage<User>({
      items,
      total: typeof (data as { total?: number }).total === 'number' ? (data as { total?: number }).total : undefined,
      limit:
        typeof (data as { per_page?: number }).per_page === 'number'
          ? (data as { per_page?: number }).per_page
          : undefined,
      offset:
        typeof (data as { offset?: number }).offset === 'number' ? (data as { offset?: number }).offset : undefined,
    });
  }

  async get(id: string | number): Promise<User | null> {
    const response = await this.http.request<User | null>({
      path: `/api/users/${id}`,
      acceptStatuses: [404],
    });
    if (response.status === 404) return null;
    return response.data ?? null;
  }

  async session(): Promise<SessionResult> {
    const response = await this.http.request<User | null>({
      path: '/api/me',
      throwOnError: false,
    });
    const ok = response.ok && response.status === 200;
    return {
      status: response.status,
      ok,
      user: ok ? (response.data ?? null) : null,
    };
  }

  async sessionIfAuthenticated(): Promise<User | null> {
    if (!hasAuthToken()) return null;
    const result = await this.session();
    return result.ok ? result.user : null;
  }

  async update(id: string | number, payload: Record<string, unknown>): Promise<User> {
    const response = await this.http.request<User>({
      path: `/api/users/${id}`,
      method: 'PUT',
      json: payload,
    });
    return response.data ?? ({} as User);
  }

  async systems(limit = 100): Promise<User[]> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/systems',
      query: { per_page: limit },
    });
    const data = response.data ?? {};
    if (Array.isArray((data as { items?: unknown[] }).items)) {
      return ((data as { items?: unknown[] }).items as User[]).filter(Boolean);
    }
    return [];
  }

  async refreshSession(): Promise<{ ok: boolean; token?: string }> {
    return refreshToken();
  }

  async changePassword(
    current: string,
    next: string,
  ): Promise<{ status: number; ok: boolean; message?: string; error?: string }> {
    const response = await this.http.request<Record<string, unknown>>({
      path: '/api/me/password',
      method: 'POST',
      json: { current_password: current, new_password: next },
      throwOnError: false,
    });
    const payload = response.data ?? {};
    return {
      status: response.status,
      ok: response.ok,
      message:
        typeof (payload as { message?: string }).message === 'string'
          ? (payload as { message?: string }).message
          : undefined,
      error:
        typeof (payload as { error?: string }).error === 'string' ? (payload as { error?: string }).error : undefined,
    };
  }

  async names(query = ''): Promise<UserNamesResponse> {
    const response = await this.http.request<UserNamesResponse>({
      path: '/api/users/names',
      query: query ? { q: query } : undefined,
    });
    return response.data ?? {};
  }

  getStoredToken(): string | null {
    return getStoredToken();
  }
}
