import { apiClient, ApiJsonValue } from '@didhub/api-client';

// Export the raw generated alter client so callers can use the typed
// generated methods directly and avoid fragile wrapper behavior.
// Prefer `alterApi` in new code; wrappers in this file remain for
// backward compatibility with existing call sites/tests.
export const alterApi = apiClient.alter;

export async function createAlter(body: Record<string, unknown>) {
  const resp = await apiClient.alter.post_alters({ body: body as ApiJsonValue });
  return resp.data ?? null;
}

export async function getAlterById(id: string) {
  const resp = await apiClient.alter.get_alters_by_id({ id });
  return resp.data ?? null;
}

export async function updateAlter(id: string, body: Record<string, unknown>) {
  const resp = await apiClient.alter.put_alters_by_id({ id, body: body as any });
  return resp.data ?? null;
}

export async function searchAlters(params: Record<string, unknown>) {
  const resp = await apiClient.alter.get_alters_search(params as any);
  return resp.data ?? null;
}

export async function listAlters(params: Record<string, unknown>) {
  const resp = await apiClient.alter.get_alters(params as any);
  return resp.data ?? null;
}

export async function getAlterNamesFallback() {
  const resp = await apiClient.alter.get_alters_search({ q: '' });
  return resp.data?.items ?? [];
}

export async function deleteAlterImage(alterId: string, url: string) {
  // The server supports deleting a single image by including
  // `delete_image_url` in the alter update payload. Prefer the generated
  // client's typed endpoint so we don't rely on internal `.http` access.
  // This also keeps behavior consistent with server-side audit logging.
  const body = { delete_image_url: String(url) };
  const resp = await apiClient.alter.put_alters_by_id({ id: String(alterId), body });
  return resp?.data ?? null;
}

export async function getFamilyTree() {
  const resp = await apiClient.alter.get_alters_family_tree({});
  return resp?.data ?? null;
}

export async function deleteAlter(id: string) {
  await apiClient.alter.delete_alters_by_id({ id });
  return null;
}
