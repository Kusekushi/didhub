export const SETTINGS = {
  DISCORD_WEBHOOK_URL: 'discord_webhook_url',
  DISCORD_DIGEST_ENABLED: 'discord_digest_enabled',
  EMAIL_ENABLED: 'email_enabled',
  EMAIL_DIGEST_RECIPIENT: 'email_digest_recipient',
  EMAIL_TRANSPORT: 'email_transport',
  OIDC_PROVIDERS: 'oidc_providers',
  OIDC_ENABLED: 'oidc_enabled',
  SHORT_LINKS_ENABLED: 'short_links_enabled',
  // Redis/admin settings
  REDIS_URL: 'redis_url',
  REDIS_PREFIX: 'redis_prefix',
  REDIS_TTL_SECONDS: 'redis_ttl_seconds',
  REDIS_CLIENT_OPTIONS: 'redis_client_options',
  REDIS_SESSIONS_ENABLED: 'redis_sessions_enabled',
  REDIS_CACHE_ENABLED: 'redis_cache_enabled',
  AUTO_UPDATE_ENABLED: 'auto_update_enabled',
} as const;

export type SettingsKey = (typeof SETTINGS)[keyof typeof SETTINGS];

export default SETTINGS;
