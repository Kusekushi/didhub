export function parseOwnerId(raw?: string | number | null): string | undefined {
  if (raw == null) return undefined;

  if (typeof raw === 'string') {
    const t = raw.trim().replace(/^#/, '').toLowerCase();
    if (!t) return undefined;

    const dashedRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const plainRe = /^[0-9a-f]{32}$/i;

    if (dashedRe.test(t)) return t;
    if (plainRe.test(t)) {
      return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20)}`;
    }
  }

  return undefined;
}

export function getEffectiveOwnerId(routeUid: string | undefined | null, authUserId?: string | null): string | undefined {
  const fromRoute = parseOwnerId(routeUid);
  if (fromRoute) return fromRoute;
  const fromAuth = parseOwnerId(authUserId ?? undefined);
  return fromAuth;
}
