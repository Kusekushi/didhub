import { apiClient } from '@didhub/api-client';

export async function getSettings() {
  const resp = await apiClient.admin.get_settings({});
  return resp?.data ?? null;
}

export default getSettings;
