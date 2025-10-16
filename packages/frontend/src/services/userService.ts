import { apiClient, EntityId } from '@didhub/api-client';
import logger from '../shared/lib/logger';

export interface InProgressMeRequestSystem {
  id: EntityId,
  status: string,
}

export async function getMeRequestSystem(): Promise<InProgressMeRequestSystem | null> {
  const resp = await apiClient.users.get_me_request_system({});
  return resp.data ?? null;
}

export async function postMeAvatar(form: FormData): Promise<EntityId | null> {
  const resp = await apiClient.users.post_me_avatar({ body: form });
  if (resp.ok) { return resp.data.avatar ?? null; }
  logger.warn(`[ERROR] postMeAvatar returned non-ok: ${resp.status}`);
  // TODO: UI output
  return null;
}

export async function deleteMeAvatar(): Promise<boolean | null> {
  const resp = await apiClient.users.delete_me_avatar({});
  return resp.ok ?? null;
}

export async function postMeRequestSystem(body?: Record<string, unknown>): Promise<InProgressMeRequestSystem | null> {
  const resp = await apiClient.users.post_me_request_system({ body: body ?? {} });
  return resp?.data ? { id: resp.data.id, status: 'pending' } : null;
}
