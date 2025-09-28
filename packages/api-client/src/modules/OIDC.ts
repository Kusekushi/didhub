import { apiFetch, ApiFetchResult } from '../Util';

export async function fetchOidcList(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await apiFetch('/api/oidc');
    if (res.status < 200 || res.status >= 300) return [];
    return res.json || [];
  } catch (e) {
    return [];
  }
}

export interface OidcProviderAdminView {
  id: string;
  name: string;
  enabled: boolean;
  has_client_secret: boolean;
  client_id: string;
}

export async function getOidcProviderSecret(id: string): Promise<OidcProviderAdminView | null> {
  try {
    const res = await apiFetch(`/api/oidc/${encodeURIComponent(id)}/secret`);
    if (res.status < 200 || res.status >= 300) return null;
    return res.json;
  } catch {
    return null;
  }
}

export async function updateOidcProviderSecret(
  id: string,
  body: { client_id?: string; client_secret?: string; enabled?: boolean },
): Promise<OidcProviderAdminView | null> {
  try {
    const res = await apiFetch(`/api/oidc/${encodeURIComponent(id)}/secret`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (res.status < 200 || res.status >= 300) return null;
    return res.json;
  } catch {
    return null;
  }
}
