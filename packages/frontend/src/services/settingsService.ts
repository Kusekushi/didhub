import { apiClient, SETTINGS as SETTINGS_KEYS } from '@didhub/api-client';

export const SETTINGS = SETTINGS_KEYS;

export async function getSettings() {
  const resp = await (apiClient.admin as any).get_settings();
  return resp?.data ?? resp ?? null;
}

export default {
  getSettings,
  SETTINGS,
};
