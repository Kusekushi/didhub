import { normalizeEntityId } from '../../shared/utils/alterFormUtils';

export interface RelationshipOption {
  id: string;
  label: string;
  aliases?: string[];
}

export function coerceIdentifier(value: string): string {
  // IDs are UUID strings; ensure we return a trimmed string.
  return String(value ?? '')
    .trim()
    .replace(/^#/u, '');
}

export function toDisplayLabel(value: unknown, idLookup: Record<string, string>): string | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    const maybeNamed =
      (value as { name?: unknown }).name ??
      (value as { label?: unknown }).label ??
      (value as { display_name?: unknown }).display_name ??
      (value as { username?: unknown }).username;
    if (maybeNamed != null && maybeNamed !== '') return String(maybeNamed);
    if ('id' in (value as Record<string, unknown>)) {
      const idValue = (value as { id?: unknown }).id;
      if (idValue != null) {
        const n = normalizeEntityId(idValue);
        if (n) {
          const label = idLookup[n];
          if (label) return label;
        }
      }
    }
  }
  const label = idLookup[String(value)];
  if (label) return label;
  const str = String(value);
  if (!str || str === '[object Object]') return null;
  return str;
}

export function stripTrailingId(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const withoutTrailingId = trimmed.replace(/\s*#\d+$/u, '').trim();
  return withoutTrailingId || trimmed;
}

export function mapToLabels(source: unknown, idLookup: Record<string, string>): string[] {
  if (!Array.isArray(source)) return [];
  return (source as unknown[])
    .map((item) => {
      const label = toDisplayLabel(item, idLookup);
      return label ? label.trim() : '';
    })
    .filter((label) => Boolean(label));
}

export function buildNameLookup(
  primary?: Record<string, string>,
  idLookup?: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (primary) {
    Object.entries(primary).forEach(([name, id]) => {
      if (!name) return;
      const n = normalizeEntityId(id);
      if (!n) return;
      result[name] = n;
      result[name.toLowerCase()] = n;
    });
  }
  if (idLookup) {
    Object.entries(idLookup).forEach(([id, label]) => {
      if (!label) return;
      const coerced = coerceIdentifier(id);
      result[label] = coerced;
      result[label.toLowerCase()] = coerced;
    });
  }
  return result;
}

export function convertLabelsToIdentifiers(
  selections: Array<string | RelationshipOption>,
  primary?: Record<string, number | string>,
  idLookup?: Record<string, string>,
): string[] {
  // Ensure primary map values are strings
  const primaryStr: Record<string, string> | undefined = primary
    ? Object.fromEntries(Object.entries(primary).map(([k, v]) => [k, String(v)]))
    : undefined;
  const lookup = buildNameLookup(primaryStr, idLookup);
  return selections
    .map((selection) => {
      if (selection && typeof selection === 'object') {
        return coerceIdentifier((selection as RelationshipOption).id);
      }
      const trimmed = String(selection ?? '').trim();
      if (!trimmed) return null;
      const match = lookup[trimmed] ?? lookup[trimmed.toLowerCase()];
      if (typeof match !== 'undefined') return coerceIdentifier(match);
      if (trimmed.startsWith('#')) {
        return trimmed.slice(1);
      }
      return trimmed;
    })
    .filter((v): v is string => v != null && v !== '');
}

export function buildOptionIndexes(options: RelationshipOption[]) {
  const byId = new Map<string, RelationshipOption>();
  const byAlias = new Map<string, RelationshipOption>();
  options.forEach((option) => {
    // Normalize the option id and store a normalized copy so callers always
    // receive string ids (entity ids are strings/UUIDs in this codebase).
    const rawId = (option as any).id;
    const idKey = normalizeEntityId(rawId);
    if (!idKey) return; // skip options without normalized ids
    const coercedId = coerceIdentifier(idKey);
    const normalizedOption: RelationshipOption = { ...option, id: coercedId } as RelationshipOption;

    byId.set(coercedId, normalizedOption);
    byAlias.set(coercedId, normalizedOption);
    byAlias.set(`#${coercedId}`, normalizedOption);
    const labelLower = normalizedOption.label.toLowerCase();
    byAlias.set(labelLower, normalizedOption);
    if (normalizedOption.aliases) {
      normalizedOption.aliases
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean)
        .forEach((alias) => {
          if (!byAlias.has(alias)) byAlias.set(alias, normalizedOption);
        });
    }
  });
  return { byId, byAlias };
}

export type TagValue = string | RelationshipOption;

export function mapSelectionsToTagValues(
  source: unknown,
  options: RelationshipOption[],
  idLookup: Record<string, string>,
): TagValue[] {
  if (!Array.isArray(source)) return [];
  if (!options.length && Object.keys(idLookup).length === 0) {
    return mapToLabels(source, idLookup);
  }
  const { byId, byAlias } = buildOptionIndexes(options);
  return (source as unknown[])
    .map((item) => {
      if (item == null) return null;

      const potentialIds: string[] = [];
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) {
          potentialIds.push(trimmed);
          if (trimmed.startsWith('#')) potentialIds.push(trimmed.slice(1));
        }
      } else if (typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
        const idValue = (item as { id?: unknown }).id;
        if (idValue != null) {
          const n = normalizeEntityId(idValue);
          if (n) potentialIds.push(n);
        }
      }

      for (const candidate of potentialIds) {
        if (!candidate) continue;
        if (byId.has(candidate)) return byId.get(candidate)!;
        const lower = candidate.toLowerCase();
        if (byAlias.has(lower)) return byAlias.get(lower)!;
      }

      const label = toDisplayLabel(item, idLookup);
      if (label) {
        const trimmed = label.trim();
        if (trimmed) {
          const lower = trimmed.toLowerCase();
          if (byAlias.has(lower)) return byAlias.get(lower)!;
          const candidateId = potentialIds.find(Boolean);
          if (candidateId) {
            const normalized = candidateId.startsWith('#') ? candidateId.slice(1) : candidateId;
            // Synthesize an option for anything that looks like an identifier
            // (either prefixed with '#' or non-empty after normalization). This
            // supports UUID/string identifiers as well as numeric ids.
            if (candidateId.startsWith('#') || normalized) {
              const mapped = { id: coerceIdentifier(normalized), label: trimmed, aliases: [] };
              return mapped;
            }
          }
          return trimmed;
        }
      }

      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const lower = trimmed.toLowerCase();
        if (byAlias.has(lower)) return byAlias.get(lower)!;
        const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
        const inferred = idLookup[normalized] ?? idLookup[trimmed];
        if (inferred) {
          const mapped = { id: coerceIdentifier(normalized), label: inferred, aliases: [] };
          return mapped;
        }
        return trimmed;
      }

      // numeric primitives should not be treated as entity ids; skip

      return null;
    })
    .filter((value): value is TagValue => Boolean(value));
}
