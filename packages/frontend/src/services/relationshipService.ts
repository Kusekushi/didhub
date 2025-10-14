import { apiClient, ApiCreatePersonRelationshipPayload } from '@didhub/api-client';

export async function getRelationships(id: string) {
  const resp = await apiClient.relationship.get_relationships({ id });
  return resp.data ?? [];
}

export async function createRelationship(payload: ApiCreatePersonRelationshipPayload) {
  const resp = await apiClient.relationship.post_relationships({ body: payload as any });
  return resp.data ?? null;
}

export async function deleteRelationship(id: string) {
  return apiClient.relationship.delete_relationships_by_id({ id });
}
