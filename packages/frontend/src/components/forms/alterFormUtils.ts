export interface RelationshipOption {
  id: number | string;
  label: string;
  aliases?: string[];
}

export function coerceIdentifier(value: number | string): number | string {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
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
        const label = idLookup[String(idValue)];
        if (label) return label;
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
  primary?: Record<string, number | string>,
  idLookup?: Record<string, string>,
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  if (primary) {
    Object.entries(primary).forEach(([name, id]) => {
      if (!name) return;
      result[name] = id;
      result[name.toLowerCase()] = id;
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
): Array<number | string> {
  const lookup = buildNameLookup(primary, idLookup);
  return selections.map((selection) => {
    if (selection && typeof selection === 'object') {
      return coerceIdentifier((selection as RelationshipOption).id);
    }
    const trimmed = String(selection ?? '').trim();
    if (!trimmed) return trimmed;
    const match = lookup[trimmed] ?? lookup[trimmed.toLowerCase()];
    if (typeof match !== 'undefined') return coerceIdentifier(match);
    if (trimmed.startsWith('#')) {
      const numericFromHash = Number(trimmed.slice(1));
      if (!Number.isNaN(numericFromHash)) return numericFromHash;
    }
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? trimmed : numeric;
  });
}

export function buildOptionIndexes(options: RelationshipOption[]) {
  const byId = new Map<string, RelationshipOption>();
  const byAlias = new Map<string, RelationshipOption>();
  options.forEach((option) => {
    const idKey = String(option.id);
    byId.set(idKey, option);
    byAlias.set(idKey, option);
    byAlias.set(`#${idKey}`, option);
    const labelLower = option.label.toLowerCase();
    byAlias.set(labelLower, option);
    if (option.aliases) {
      option.aliases
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean)
        .forEach((alias) => {
          if (!byAlias.has(alias)) byAlias.set(alias, option);
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
      if (typeof item === 'number') {
        potentialIds.push(String(item));
      } else if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) {
          potentialIds.push(trimmed);
          if (trimmed.startsWith('#')) potentialIds.push(trimmed.slice(1));
        }
      } else if (typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
        const idValue = (item as { id?: unknown }).id;
        if (idValue != null) potentialIds.push(String(idValue));
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
            // Only synthesize an option when the candidate looks like an id (numeric)
            // or was explicitly provided with a leading '#'. Otherwise return the
            // plain trimmed label so free-text remains a string.
            if (candidateId.startsWith('#') || /^[0-9]+$/u.test(normalized)) {
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

      if (typeof item === 'number') {
        const idKey = String(item);
        if (byId.has(idKey)) return byId.get(idKey)!;
        const inferred = idLookup[idKey];
        if (inferred) {
          const mapped = { id: coerceIdentifier(idKey), label: inferred, aliases: [] };
          return mapped;
        }
        return idKey;
      }

      return null;
    })
    .filter((value): value is TagValue => Boolean(value));
}
