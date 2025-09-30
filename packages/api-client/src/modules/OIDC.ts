import { HttpClient } from '../core/HttpClient';

export interface OidcProviderAdminView {
  id: string;
  name: string;
  enabled: boolean;
  has_client_secret: boolean;
  client_id: string;
}

export class OidcApi {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<{ id: string; name: string }[]> {
    const response = await this.http.request<Array<{ id: string; name: string }> | null>({
      path: '/api/oidc',
      throwOnError: false,
    });
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data;
  }

  async getSecret(id: string): Promise<OidcProviderAdminView | null> {
    const response = await this.http.request<OidcProviderAdminView | null>({
      path: `/api/oidc/${encodeURIComponent(id)}/secret`,
      throwOnError: false,
    });
    if (!response.ok) return null;
    return response.data ?? null;
  }

  async updateSecret(
    id: string,
    body: { client_id?: string; client_secret?: string; enabled?: boolean },
  ): Promise<OidcProviderAdminView | null> {
    const response = await this.http.request<OidcProviderAdminView | null>({
      path: `/api/oidc/${encodeURIComponent(id)}/secret`,
      method: 'POST',
      json: body ?? {},
      throwOnError: false,
    });
    if (!response.ok) return null;
    return response.data ?? null;
  }
}
