import { isUuid } from './alterFormUtils';

export function parseOwnerId(raw?: string | number | null): string | undefined {
  // Only accept UUIDs (dashed or 32-hex without dashes). Numeric IDs are
  // explicitly not supported in this codebase.
  if (raw == null) return undefined;

  if (typeof raw === 'number') return undefined;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    // strip optional leading '#'
    const candidate = trimmed.replace(/^#/u, '');
    const lower = candidate.toLowerCase();

    // If it's already a valid dashed UUID, return it
    // Accept either the library validator or the dashed regex as a fallback
    const dashedRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (isUuid(lower) || dashedRe.test(lower)) return lower;

    // Accept 32-hex strings and normalize to dashed format
    const plainRe = /^[0-9a-f]{32}$/i;
    if (plainRe.test(lower)) {
      return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    }
  }

  return undefined;
}

export function getEffectiveOwnerId(
  routeUid: string | undefined | null,
  authUserId?: string | null,
): string | undefined {
  const fromRoute = parseOwnerId(routeUid);
  if (fromRoute) return fromRoute;
  const fromAuth = parseOwnerId(authUserId ?? undefined);
  return fromAuth;
}
