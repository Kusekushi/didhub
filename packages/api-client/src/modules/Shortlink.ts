import { HttpClient } from '../core/HttpClient';

export type ShortLinkTargetType = 'alter' | 'group' | 'subsystem' | 'system';

export interface ShortLinkRecord {
  id: number;
  token: string;
  target: string;
}

export interface CreateShortLinkOptions {
  target?: string;
}

const defaultTargetResolvers: Record<ShortLinkTargetType, (id: string | number) => string> = {
  alter: (id) => `/detail/${id}`,
  group: (id) => `/groups/${id}`,
  subsystem: (id) => `/subsystems/${id}`,
  system: (id) => `/did-system/${id}`,
};

const defaultBaseUrl = (): string => {
  if (typeof window === 'undefined' || !window.location) return '';
  try {
    return window.location.origin.replace(/:\d+$/, '');
  } catch {
    return '';
  }
};

export const getShortLinkPath = (record: ShortLinkRecord): string => `/s/${record.token}`;

export const getShortLinkUrl = (record: ShortLinkRecord, baseUrl?: string): string => {
  const path = getShortLinkPath(record);
  const base = baseUrl ?? defaultBaseUrl();
  if (!base) return path;
  return `${base}${path}`;
};

export const parseShortLinkRecord = (value: unknown): ShortLinkRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id;
  const id =
    typeof rawId === 'number'
      ? rawId
      : typeof rawId === 'string' && rawId.trim() !== '' && Number.isFinite(Number(rawId))
        ? Number(rawId)
        : null;
  const token = typeof record.token === 'string' ? record.token : null;
  const target = typeof record.target === 'string' ? record.target : null;
  if (id === null || !token || !target) return null;
  return { id, token, target };
};

export interface ShortLinkResult {
  status: number;
  ok: boolean;
  record: ShortLinkRecord | null;
  error?: string;
}

export class ShortlinksApi {
  constructor(private readonly http: HttpClient) {}

  async create(
    type: ShortLinkTargetType,
    id: string | number,
    options: CreateShortLinkOptions = {},
  ): Promise<ShortLinkRecord> {
    const resolver = defaultTargetResolvers[type];
    if (!resolver) {
      throw new Error(`Unknown shortlink type: ${type}`);
    }
    const target = options.target ?? resolver(id);
    const response = await this.http.request<Record<string, unknown> | null>({
      path: '/api/shortlink',
      method: 'POST',
      json: { target },
      throwOnError: false,
    });

    const record = parseShortLinkRecord(response.data);
    if (!record) {
      const message =
        (response.data && typeof (response.data as { error?: string }).error === 'string'
          ? (response.data as { error?: string }).error
          : undefined) ?? 'Failed to create shortlink';
      throw new Error(message);
    }

    return record;
  }

  async fetch(token: string): Promise<ShortLinkResult> {
    const response = await this.http.request<Record<string, unknown> | null>({
      path: `/api/shortlink/${encodeURIComponent(token)}`,
      throwOnError: false,
    });

    const record = parseShortLinkRecord(response.data);
    return {
      status: response.status,
      ok: response.ok && Boolean(record),
      record,
      error:
        response.data && typeof (response.data as { error?: string }).error === 'string'
          ? (response.data as { error?: string }).error
          : undefined,
    };
  }
}
