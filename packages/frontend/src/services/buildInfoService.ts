export type BuildInfo = {
  server_version: string;
  frontend_version: string;
  db_version: string;
  auth_version: string;
  cache_version: string;
  error_version: string;
  config_version: string;
  oidc_version: string;
  metrics_version: string;
  housekeeping_version: string;
  middleware_version: string;
  updater_version: string;
  migrations_version: string;
  git_commit: string;
  build_time: string;
  target: string;
};

export async function fetchBuildInfo(): Promise<BuildInfo | null> {
  try {
  const res = await fetch('/api/version');
    if (!res.ok) return null;
    const data = await res.json();
    return data as BuildInfo;
  } catch (e) {
    // swallow errors; build info is optional
    // eslint-disable-next-line no-console
    console.debug('fetchBuildInfo failed', e);
    return null;
  }
}

export async function logBuildInfo(): Promise<void> {
  const info = await fetchBuildInfo();
  if (info) {
    // eslint-disable-next-line no-console
    console.info('DIDHub build info', info);
  }
}
