export function parseNumericOwnerId(raw?: string | number | null): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const t = raw.trim().replace(/^#/, '');
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function getEffectiveOwnerId(routeUid: string | undefined | null, authUserId?: number | null): number | undefined {
  const fromRoute = parseNumericOwnerId(routeUid as string | number | undefined);
  if (typeof fromRoute === 'number') return fromRoute;
  if (typeof authUserId === 'number') return authUserId;
  return undefined;
}
