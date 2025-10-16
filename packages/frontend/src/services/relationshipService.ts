import { apiClient, ApiCreatePersonRelationshipPayload, EntityId } from '@didhub/api-client';

export async function getRelationships(id: EntityId) {
  const resp = await apiClient.relationship.get_relationships({ id });
  return resp.data ?? [];
}

export async function createRelationship(payload: ApiCreatePersonRelationshipPayload) {
  const resp = await apiClient.relationship.post_relationships({ body: payload as any });
  return resp.data ?? null;
}

export async function deleteRelationship(id: EntityId) {
  return apiClient.relationship.delete_relationships_by_id({ id });
}
