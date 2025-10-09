// Auto-generated HttpClient - do not edit manually

import { getStoredToken, readCsrfToken } from '../utils/storage';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface HttpClientConfig {
  baseUrl?: string;
  credentials?: RequestCredentials;
  defaultHeaders?: HeadersInit;
}

export interface RequestOptions<TBody = unknown> {
  method?: HttpMethod;
  path: string;
  query?: QueryParams;
  headers?: HeadersInit;
  json?: unknown;
  body?: TBody;
  auth?: boolean;
  parse?: 'json' | 'text' | 'none';
  acceptStatuses?: number[];
  throwOnError?: boolean;
  credentials?: RequestCredentials;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  raw: Response;
  headers: Headers;
  url: string;
  text: string;
}

const MUTATING_METHODS: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

const HTTP_DEBUG_STORE_KEY = '__DIDHUB_HTTP_LOGS__';
const MAX_HTTP_DEBUG_ENTRIES = 200;
let httpRequestCounter = 0;

function isHttpDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const globalAny = window as unknown as Record<string, unknown>;
  if (globalAny.__DIDHUB_HTTP_DEBUG__ === false) return false;
  if (globalAny.__DIDHUB_HTTP_DEBUG__ === true) return true;
  try {
    const stored = window.localStorage.getItem('didhub-debug-http');
    if (stored && ['1', 'true', 'yes', 'on'].includes(stored.toLowerCase())) return true;
  } catch {
    // ignore storage access issues
  }
  return false;
}

interface HttpDebugEntry {
  event: 'start' | 'complete' | 'error';
  id: number;
  ts: number;
  [key: string]: unknown;
}

function recordHttpDebug(entry: HttpDebugEntry): void {
  if (!isHttpDebugEnabled()) return;
  if (typeof window !== 'undefined') {
    const globalAny = window as unknown as Record<string, unknown>;
    const store = (globalAny[HTTP_DEBUG_STORE_KEY] as HttpDebugEntry[]) ?? [];
    if (!Array.isArray(store)) {
      globalAny[HTTP_DEBUG_STORE_KEY] = [entry];
    } else {
      store.push(entry);
      if (store.length > MAX_HTTP_DEBUG_ENTRIES) {
        store.splice(0, store.length - MAX_HTTP_DEBUG_ENTRIES);
      }
      globalAny[HTTP_DEBUG_STORE_KEY] = store;
    }
    globalAny.__DIDHUB_HTTP_LAST__ = entry;
  }
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[HttpClient]', entry);
  }
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly credentials?: RequestCredentials;
  private readonly defaultHeaders: HeadersInit | undefined;

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? '';
    this.credentials = config.credentials;
    this.defaultHeaders = config.defaultHeaders;
  }

  async request<T = unknown>(options: RequestOptions): Promise<HttpResponse<T>> {
    const method: HttpMethod = (options.method ?? 'GET').toUpperCase() as HttpMethod;
    const url = this.buildUrl(options.path, options.query);
    const headers = new Headers(this.defaultHeaders);
    const debugEnabled = isHttpDebugEnabled();
    const requestId = debugEnabled ? ++httpRequestCounter : 0;
    const startedAt = debugEnabled ? Date.now() : 0;

    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    }

    const init: RequestInit = {
      method,
      headers,
      credentials: options.credentials ?? this.credentials ?? 'include',
      cache: 'no-store',
    };

    const shouldAttachAuth = options.auth ?? options.path.startsWith('/api');
    if (shouldAttachAuth) {
      const token = getStoredToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
    }

    if (options.json !== undefined) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      init.body = JSON.stringify(options.json);
    } else if (options.body instanceof FormData) {
      init.body = options.body;
    } else if (options.body !== undefined) {
      init.body = options.body as BodyInit;
    }

    if (
      shouldAttachAuth &&
      MUTATING_METHODS.includes(method) &&
      typeof document !== 'undefined' &&
      !headers.has('x-csrf-token')
    ) {
      const csrf = readCsrfToken();
      if (csrf) headers.set('x-csrf-token', csrf);
    }

    if (debugEnabled) {
      recordHttpDebug({
        event: 'start',
        id: requestId,
        ts: startedAt,
        method,
        url,
        headers: Object.fromEntries(headers.entries()),
      });
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (debugEnabled) {
        recordHttpDebug({
          event: 'error',
          id: requestId,
          ts: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }

    const responseText = await response.text();
    let responseData: unknown = responseText;

    const parse = options.parse ?? 'json';
    if (parse === 'json' && responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // If JSON parsing fails, keep as text
      }
    }

    const httpResponse: HttpResponse<T> = {
      status: response.status,
      ok: response.ok,
      data: responseData as T,
      raw: response,
      headers: response.headers,
      url,
      text: responseText,
    };

    if (debugEnabled) {
      recordHttpDebug({
        event: 'complete',
        id: requestId,
        ts: Date.now(),
        status: response.status,
        duration: Date.now() - startedAt,
        size: responseText.length,
      });
    }

    const acceptStatuses = options.acceptStatuses ?? [200, 201, 202, 204];
    const shouldThrow = options.throwOnError ?? !acceptStatuses.includes(response.status);

    if (shouldThrow && !response.ok) {
      throw new ApiError(httpResponse);
    }

    return httpResponse;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const base = this.baseUrl ? this.baseUrl.replace(/\/$/, '') : '';
    const resolvedPath =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${base}${path.startsWith('/') ? path : `/${path}`}`;

    if (!query || Object.keys(query).length === 0) return resolvedPath;
    const searchParams = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null) return;
          searchParams.append(key, String(item));
        });
        return;
      }
      searchParams.append(key, String(value));
    });

    return `${resolvedPath}?${searchParams.toString()}`;
  }
}

export class ApiError extends Error {
  public readonly response: HttpResponse;

  constructor(response: HttpResponse) {
    super(`HTTP ${response.status}: ${response.text}`);
    this.name = 'ApiError';
    this.response = response;
  }
}