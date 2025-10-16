import { apiClient, EntityId } from '@didhub/api-client';

export async function getSubsystemById(id: EntityId) {
  const resp = await apiClient.subsystem.get_subsystems_by_id({ id });
  return resp.data ?? null;
}

export async function listSubsystems(params: Record<string, unknown>) {
  const resp = await apiClient.subsystem.get_subsystems(params as any);
  return resp.data ?? null;
}

export async function updateSubsystem(id: EntityId, payload: Record<string, unknown>) {
  const resp = await apiClient.subsystem.put_subsystems_by_id({ id, body: payload as any });
  return resp.data ?? null;
}

export async function toggleLeader(id: EntityId, alter_id: EntityId, add: boolean) {
  await apiClient.subsystem.post_subsystems_by_id_leaders_toggle({ id, body: { alter_id: String(alter_id), add } as any });
}

export async function getMembers(id: EntityId) {
  const resp = await apiClient.subsystem.get_subsystems_by_id_members({ id });
  return resp.data ?? null;
}

export async function toggleLeaderRaw(id: EntityId, payload: Record<string, unknown>) {
  await apiClient.subsystem.post_subsystems_by_id_leaders_toggle({ id, body: payload as any });
}

export async function createSubsystem(payload: Record<string, unknown>) {
  const resp = await apiClient.subsystem.post_subsystems({ body: payload as any });
  return resp.data ?? null;
}

export async function deleteSubsystem(id: EntityId) {
  const resp = await apiClient.subsystem.delete_subsystems_by_id({ id } as any);
  return resp.data ?? null;
}
