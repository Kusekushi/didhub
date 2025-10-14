import { apiClient } from '@didhub/api-client';

export async function getMeRequestSystem() {
  const resp = await apiClient.users.get_me_request_system({});
  return resp.data ?? null;
}

export async function postMeAvatar(form: FormData) {
  // generated client expects a body param as { body: form }
  const resp = await apiClient.users.post_me_avatar({ body: form as any } as any);
  return resp ?? null;
}

export async function deleteMeAvatar() {
  // some generated methods require an empty object param
  const resp = await apiClient.users.delete_me_avatar({} as any);
  return resp ?? null;
}

export async function postMeRequestSystem(body?: Record<string, unknown>) {
  const resp = await apiClient.users.post_me_request_system({ body: body ?? {} } as any);
  return resp ?? null;
}
