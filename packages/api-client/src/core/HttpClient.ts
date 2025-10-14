// Auto-generated HttpClient - do not edit manually

import { getStoredToken, readCsrfToken } from '../utils/storage';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export type QueryInput =
  | QueryParams
  | URLSearchParams
  | string
  | null
  | undefined
  | Record<string, unknown>
  | object;
export interface HttpClientConfig {
  baseUrl?: string;
  credentials?: RequestCredentials;
  defaultHeaders?: HeadersInit;
}

export interface RequestOptions<TBody = unknown, TQuery extends QueryInput = QueryInput> {
  method?: HttpMethod;
  path: string;
  query?: TQuery;
  headers?: HeadersInit;
  json?: unknown;
  body?: TBody;
  auth?: boolean;
  parse?: 'json' | 'text' | 'none' | 'arraybuffer';
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

  async request<T = unknown, TBody = unknown, TQuery extends QueryInput = QueryInput>(
    options: RequestOptions<TBody, TQuery>
  ): Promise<HttpResponse<T>> {
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

    // Choose how to read the response body. For binary responses (zip, octet-stream,
    // compressed types) we must use arrayBuffer() to preserve raw bytes. The generated
    // client previously always called response.text(), which decodes bytes into a JS
    // string and can corrupt binary payloads.
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const parse = options.parse ?? 'json';

    let responseText = '';
    let responseData: unknown = undefined;

    const binaryContent = /application\/(zip|octet-stream|x-zip-compressed)|application\/gzip|application\/x-gzip|application\/x-tar/i.test(contentType);

    if (binaryContent || parse === 'none' || parse === 'arraybuffer') {
      // Read raw bytes
      const ab = await response.arrayBuffer();
      responseData = ab;
      // Keep text empty for binary responses to avoid accidental string use
      responseText = '';
    } else {
      // Default to text based handling (text/json)
      responseText = await response.text();
      responseData = responseText;
      if (parse === 'json' && responseText) {
        try {
          responseData = JSON.parse(responseText);
        } catch {
          // If JSON parsing fails, keep as text
          responseData = responseText;
        }
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
      const size = responseData instanceof ArrayBuffer ? (responseData as ArrayBuffer).byteLength : responseText.length;
      recordHttpDebug({
        event: 'complete',
        id: requestId,
        ts: Date.now(),
        status: response.status,
        duration: Date.now() - startedAt,
        size,
      });
    }

    const acceptStatuses = options.acceptStatuses ?? [200, 201, 202, 204];
    const shouldThrow = options.throwOnError ?? !acceptStatuses.includes(response.status);

    if (shouldThrow && !response.ok) {
      throw new ApiError(httpResponse);
    }

    return httpResponse;
  }

  private buildUrl(path: string, query?: QueryInput): string {
    const base = this.baseUrl ? this.baseUrl.replace(/\/$/, '') : '';
    const resolvedPath =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${base}${path.startsWith('/') ? path : `/${path}`}`;

    if (!query) return resolvedPath;

    if (typeof query === 'string') {
      const trimmed = query.startsWith('?') ? query.slice(1) : query;
      return trimmed ? `${resolvedPath}?${trimmed}` : resolvedPath;
    }

    if (query instanceof URLSearchParams) {
      const paramsString = query.toString();
      return paramsString ? `${resolvedPath}?${paramsString}` : resolvedPath;
    }

    const flatQuery = this.normalizeQuery(query as Record<string, unknown>);
    if (Object.keys(flatQuery).length === 0) {
      return resolvedPath;
    }
    const searchParams = new URLSearchParams();

    Object.entries(flatQuery).forEach(([key, value]) => {
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

  private normalizeQuery(query: Record<string, unknown> | object): QueryParams {
    const entries = Object.entries(query ?? {});
    if (entries.length === 0) return {};

    const normalized: QueryParams = {};

    for (const [key, value] of entries) {
      const normalizedValue = this.normalizeQueryValue(value);
      if (normalizedValue === undefined) continue;
      normalized[key] = normalizedValue;
    }

    return normalized;
  }

  private normalizeQueryValue(
    value: unknown
  ): QueryValue | QueryValue[] | undefined {
    if (value === undefined || value === null) return undefined;

    if (Array.isArray(value)) {
      const arrayValues = value
        .map((item) => this.normalizeQueryValue(item))
        .flatMap((item) => (Array.isArray(item) ? item : item !== undefined ? [item] : []));
      return arrayValues.length > 0 ? arrayValues : undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    switch (typeof value) {
      case 'string':
      case 'number':
      case 'boolean':
        return value;
      case 'object':
        return JSON.stringify(value);
      default:
        return String(value);
    }
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