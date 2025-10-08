import type { AlterName } from '@didhub/api-client';

export interface RelationshipOption {
  id: number | string;
  label: string;
  aliases: string[];
}

export interface RelationshipSources {
  partners?: unknown;
  parents?: unknown;
  children?: unknown;
}

/**
 * Formats an alter's display name for UI presentation
 */
export function formatAlterDisplayName(item: Pick<AlterName, 'id' | 'name' | 'username'>): string {
  const idPart = typeof item.id !== 'undefined' ? `#${item.id}` : '';
  const baseName = (item.name ?? '').trim();
  const username = (item.username ?? '').trim();
  const segments: string[] = [];

  if (baseName) segments.push(baseName);
  if (username) segments.push(`(@${username})`);
  if (!segments.length) {
    return idPart ? `Alter ${idPart}` : 'Alter';
  }
  if (idPart) segments.push(idPart);
  return segments.join(' ');
}

/**
 * Collects relationship IDs from various input formats
 */
export function collectRelationshipIds(source: unknown): Array<number | string> {
  if (!source) return [];

  if (Array.isArray(source)) {
    return source
      .map((item) => {
        if (item == null) return null;
        if (typeof item === 'number') return item;
        if (typeof item === 'string') {
          const trimmed = item.trim();
          if (!trimmed) return null;
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) return collectRelationshipIds(parsed);
            } catch (e) {
              return trimmed;
            }
          }
          return trimmed;
        }
        return null;
      })
      .flat()
      .filter((value): value is number | string => value !== null && value !== '');
  }

  if (typeof source === 'number') return [source];

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return collectRelationshipIds(parsed);
      } catch (e) {
        // fall through to comma split
      }
    }
    return trimmed
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Extracts numeric IDs from relationship sources, resolving aliases
 */
export function extractNumericIds(
  items: unknown[],
  aliasMap?: Record<string, number | string>
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const item of items) {
    let candidate: unknown = item;

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const mapped = aliasMap?.[trimmed] ?? aliasMap?.[trimmed.toLowerCase()];
      if (typeof mapped !== 'undefined') {
        candidate = mapped;
      }
      const numeric = Number(String(candidate).trim().replace(/^#/u, ''));
      if (!Number.isFinite(numeric)) continue;
      candidate = numeric;
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const id = candidate;
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }

  return result;
}

/**
 * Normalizes affiliation IDs from various input formats
 */
export function normalizeAffiliationIds(source: unknown): number[] | null {
  if (source == null) return null;

  const rawItems: unknown[] = (() => {
    if (Array.isArray(source)) return source;
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // fall through to comma split
        }
      }
      return trimmed
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
    if (typeof source === 'number') return [source];
    return null;
  })();

  if (!rawItems) return null;

  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const item of rawItems) {
    let candidate: number | null = null;

    if (typeof item === 'number' && Number.isFinite(item)) {
      candidate = item;
    } else if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const numeric = Number(trimmed.replace(/^#/u, ''));
      if (Number.isFinite(numeric)) candidate = numeric;
    } else if (typeof item === 'object' && item !== null) {
      const obj = item as { id?: unknown };
      if (typeof obj.id === 'number' && Number.isFinite(obj.id)) {
        candidate = obj.id;
      } else if (typeof obj.id === 'string') {
        const trimmed = obj.id.trim();
        if (trimmed) {
          const numeric = Number(trimmed.replace(/^#/u, ''));
          if (Number.isFinite(numeric)) candidate = numeric;
        }
      }
    }

    if (candidate != null && !seen.has(candidate)) {
      seen.add(candidate);
      normalized.push(candidate);
    }
  }

  return normalized;
}

/**
 * Processes array fields that may come as strings
 */
export function processArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Extracts field errors from API error responses
 */
export function extractFieldErrors(error: unknown): Record<string, string> | undefined {
  if (typeof error === 'object' && error !== null) {
    const maybeData = (error as { data?: unknown }).data;
    if (maybeData && typeof maybeData === 'object') {
      if ('errors' in maybeData && typeof (maybeData as { errors?: unknown }).errors === 'object') {
        return (maybeData as { errors?: Record<string, string> }).errors;
      }
      if ('error' in maybeData && typeof (maybeData as { error?: unknown }).error === 'string') {
        return { general: (maybeData as { error?: string }).error ?? 'Request failed' };
      }
    }
  }
  if (error instanceof Error && error.message) {
    return { general: error.message };
  }
  return undefined;
}