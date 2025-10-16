import { apiClient, EntityId } from '@didhub/api-client';

export async function listGroups(params: Record<string, unknown>) {
  const resp = await apiClient.group.get_groups(params as any);
  return resp.data ?? null;
}

export async function createGroup(payload: Record<string, unknown>) {
  const resp = await apiClient.group.post_groups({ body: payload as any });
  return resp.data ?? null;
}

export async function getGroupById(id: EntityId) {
  const resp = await apiClient.group.get_groups_by_id({ id });
  return resp.data ?? null;
}

export async function updateGroup(id: EntityId, payload: Record<string, unknown>) {
  const resp = await apiClient.group.put_groups_by_id({ id, body: payload as any });
  return resp.data ?? null;
}

export async function getMembers(id: EntityId) {
  const resp = await apiClient.group.get_groups_by_id_members({ id });
  return resp.data ?? null;
}

export async function deleteGroup(id: EntityId) {
  // delete group by id via generated client and return nothing on success
  await apiClient.group.delete_groups_by_id({ id } as any);

  return null;
}
