import { apiClient } from '@didhub/api-client';

export async function login(username: string, password: string) {
  const resp = await apiClient.users.post_auth_login({ body: { username, password } as any });
  return resp.data ?? null;
}

export async function refresh() {
  const resp = await apiClient.users.post_auth_refresh({ body: {} });
  return resp.data ?? null;
}

export async function getMe() {
  const resp = await apiClient.users.get_me({});
  return resp.data ?? null;
}

export async function listOidcProviders() {
  const resp = await (apiClient.oidc as any).get_oidc({});
  return resp ?? [];
}
export async function register(username: string, password: string, is_system = false) {
  const resp = await apiClient.users.post_auth_register({ body: { username, password, is_system } as any });
  return resp.data ?? null;
}

export async function changePassword(payload: { current_password: string; new_password: string }) {
  const resp = await apiClient.users.post_me_password({ body: payload as any });
  return resp.data ?? null;
}
