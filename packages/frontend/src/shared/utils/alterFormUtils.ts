// Minimal alter name shape used by UI formatting
type AlterName = { id?: string | number; name?: string | null; username?: string | null };
import uniq from 'lodash-es/uniq';
import { validate as uuidValidate } from 'uuid';

export interface RelationshipOption {
  id: string;
  label: string;
  aliases: string[];
}

// Alias for entity IDs (UUID strings).
export type EntityId = string;

export interface RelationshipSources {
  partners?: unknown;
  parents?: unknown;
  children?: unknown;
}

/**
 * Lightweight validator for UUID strings (v1-v5). Use `uuid` package's
 * validate() if you prefer a dependency; this regex is small and sufficient
 * for normalization sanity checks.
 */
export function isUuid(value: string): boolean {
  try {
    return uuidValidate(value);
  } catch {
    return false;
  }
}

/**
 * Normalizes an entity identifier (string or object with `id`) to a clean
 * string or null. Removes leading '#' and trims. Does not coerce numbers.
 */
export function normalizeEntityId(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    const t = input.trim().replace(/^#/u, '');
    return t || null;
  }
  if (typeof input === 'object' && input !== null && 'id' in (input as Record<string, unknown>)) {
    const idv = (input as { id?: unknown }).id;
    if (typeof idv === 'string') return idv.trim().replace(/^#/u, '') || null;
  }
  return null;
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
export function collectRelationshipIds(source: unknown): string[] {
  if (!source) return [];

  const result: string[] = [];

  const pushIfValid = (candidate: unknown) => {
    const id = normalizeEntityId(candidate);
    if (id) result.push(id);
  };

  if (Array.isArray(source)) {
    for (const item of source) {
      if (item == null) continue;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              collectRelationshipIds(parsed).forEach((id) => result.push(id));
              continue;
            }
          } catch {
            // treat as plain string below
          }
        }
        pushIfValid(trimmed);
      } else if (typeof item === 'object') {
        pushIfValid(item);
      }
    }
    return uniq(result);
  }

  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return collectRelationshipIds(parsed);
      } catch {
        // fall through to comma-split
      }
    }
    for (const segment of trimmed.split(',')) pushIfValid(segment.trim());
    return uniq(result);
  }

  return [];
}

/**
 * Extracts numeric IDs from relationship sources, resolving aliases
 */
export function extractNumericIds(items: unknown[], aliasMap?: Record<string, string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const mappedCandidate = (() => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null && 'id' in (item as Record<string, unknown>)) {
        const idv = (item as { id?: unknown }).id;
        if (typeof idv === 'string') return idv;
      }
      return undefined;
    })();

    if (!mappedCandidate) continue;
    const lookupKey = mappedCandidate;
    const mapped = aliasMap?.[lookupKey] ?? aliasMap?.[lookupKey.toLowerCase()];
    const candidateStr = (mapped ?? mappedCandidate).trim().replace(/^#/u, '');
    if (!candidateStr) continue;
    if (!seen.has(candidateStr)) {
      seen.add(candidateStr);
      result.push(candidateStr);
    }
  }

  return result;
}

/**
 * Normalizes affiliation IDs from various input formats
 */
export function normalizeAffiliationIds(source: unknown): string[] | null {
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
    // Numbers are not valid entity IDs in our system (IDs are UUID strings).
    // Only accept arrays or strings; other types are treated as absent.
    return null;
  })();

  if (!rawItems) return null;

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of rawItems) {
    const candidateRaw = normalizeEntityId(item);
    if (!candidateRaw) continue;
    const candidate = candidateRaw;
    if (!seen.has(candidate)) {
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
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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
