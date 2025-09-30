import { apiFetch, ApiFetchResult, ApiFetchResultError } from '../Util';

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

export async function createShortLink(
  type: ShortLinkTargetType,
  id: string | number,
  options: CreateShortLinkOptions = {},
): Promise<ShortLinkRecord> {
  const resolver = defaultTargetResolvers[type];
  if (!resolver) {
    throw new Error(`Unknown shortlink type: ${type}`);
  }
  const target = options.target ?? resolver(id);
  const response = await apiFetch('/api/shortlink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });

  if (response.status >= 400) {
    const message =
      (response.json && typeof (response.json as Record<string, unknown>).error === 'string'
        ? String((response.json as Record<string, unknown>).error)
        : null) || 'Failed to create shortlink';
    throw new Error(message);
  }

  const record = parseShortLinkRecord(response.json);
  if (!record) {
    throw new Error('Unexpected shortlink response');
  }

  return record;
}

export async function getShortlinkRecord(token: string): Promise<ShortLinkRecord | ApiFetchResultError> {
  const response = await apiFetch(`/api/shortlink/${encodeURIComponent(token)}`);
  const record = parseShortLinkRecord(response.json);
  if (record) {
    return record;
  }
  return { status: response.status } as ApiFetchResultError;
}
