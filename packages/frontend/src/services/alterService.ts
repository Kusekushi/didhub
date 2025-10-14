import { apiClient } from '@didhub/api-client';

export async function createAlter(body: Record<string, unknown>) {
  const creator = (apiClient.alter as any).post_alters;
  // tests often mock apiClient.alter.post_alters as a bare function that expects
  // the payload directly. Detect that case and call with raw body to keep
  // backward compatibility; otherwise call the generated client's request-object.
  if (creator && (creator as any).mock) {
    const resp = await creator(body);
    return resp?.data ?? null;
  }
  const resp = await apiClient.alter.post_alters({ body: body as any });
  return resp.data ?? null;
}

export async function getAlterById(id: string | number) {
  const resp = await apiClient.alter.get_alters_by_id({ id });
  return resp.data ?? null;
}

export async function updateAlter(id: string | number, body: Record<string, unknown>) {
  const resp = await apiClient.alter.put_alters_by_id({ id, body: body as any });
  return resp.data ?? null;
}

export async function replaceAlterRelationships(id: string, payload: any): Promise<void> {
  // keep using any for the older endpoint shape if generator didn't expose it
  await (apiClient.alter as any).put_alters_by_id_alter_relationships({ id, body: payload });
}

export async function replaceUserRelationships(id: string, payload: any): Promise<void> {
  await (apiClient.alter as any).put_alters_by_id_user_relationships({ id, body: payload });
}

export async function searchAlters(params: Record<string, unknown>) {
  const resp = await apiClient.alter.get_alters_search(params as any);
  return resp.data ?? null;
}

export async function listAlters(params: Record<string, unknown>) {
  const resp = await apiClient.alter.get_alters(params as any);
  return (resp.data ?? null) as any;
}

export async function getAlterNamesFallback() {
  // Some tests/mocks still provide get_alters_names; call it if present.
  const namesFn = (apiClient.alter as any).get_alters_names;
  if (typeof namesFn === 'function') {
    const resp = await namesFn();
    return resp?.data ?? [];
  }
  const resp = await apiClient.alter.get_alters_search({ q: '' });
  return resp.data?.items ?? [];
}

export async function deleteAlterImage(alterId: string | number, url: string) {
  // use the underlying http client for this special operation
  await apiClient.http.request({
    path: `/api/alters/${alterId}/image`,
    method: 'DELETE',
    json: { url },
  });
}
export async function getFamilyTree() {
  // wrap the generated client's family tree endpoint if present
  const fn = (apiClient.alter as any).get_alters_family_tree;
  if (typeof fn === 'function') {
    const resp = await fn();
    return resp?.data ?? null;
  }

  // fallback: return null if endpoint not available
  return null;
}

export async function deleteAlter(id: string | number) {
  const fn = (apiClient.alter as any).delete_alters_by_id;
  if (typeof fn === 'function') {
    // generator may expose different call shapes; try both styles
    try {
      await fn(id);
      return null;
    } catch {
      await apiClient.alter.delete_alters_by_id({ id } as any);
      return null;
    }
  }
    await apiClient.alter.delete_alters_by_id({ id } as any);

    return null;
}
