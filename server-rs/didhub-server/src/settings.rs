use serde::{Deserialize, Serialize};

// Define structured settings domains.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct FeatureFlags {
    #[serde(default)]
    pub discord_digest: bool,
    #[serde(default)]
    pub email: bool,
    #[serde(default)]
    pub oidc: bool,
    #[serde(default)]
    pub redis_sessions: bool,
    #[serde(default)]
    pub redis_cache: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OidcProvider {
    pub id: String,
    pub issuer: String,
    pub client_id: String,
    #[serde(default)]
    pub client_secret_set: bool,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RedisSettings {
    pub url: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(default)]
    pub ttl_seconds: Option<u64>,
}

pub enum SettingKey<'a> {
    DiscordWebhook,
    FeatureFlags,
    OidcProviders,
    Redis,
    AppUploadDir,
    FeatureOidcEnabled,
    FeatureEmailEnabled,
    AvatarMaxDim,
    UploadImageMaxDim,
    AutoUpdateEnabled,
    Raw(&'a str),
}

impl<'a> SettingKey<'a> {
    pub fn as_str(&self) -> &str {
        match self {
            Self::DiscordWebhook => "discord_webhook_url",
            Self::FeatureFlags => "feature.flags",
            Self::OidcProviders => "oidc.providers",
            Self::Redis => "redis.settings",
            Self::AppUploadDir => "app.upload_dir",
            Self::FeatureOidcEnabled => "feature.oidc_enabled",
            Self::FeatureEmailEnabled => "feature.email_enabled",
            Self::AvatarMaxDim => "avatar.max_dim",
            Self::UploadImageMaxDim => "upload.image.max_dim",
            Self::AutoUpdateEnabled => "auto_update_enabled",
            Self::Raw(s) => s,
        }
    }
}

pub fn classify(key: &str) -> SettingKey<'_> {
    match key {
        "discord_webhook_url" => SettingKey::DiscordWebhook,
        "feature.flags" => SettingKey::FeatureFlags,
        "oidc.providers" => SettingKey::OidcProviders,
        "redis.settings" => SettingKey::Redis,
        "app.upload_dir" => SettingKey::AppUploadDir,
        "feature.oidc_enabled" => SettingKey::FeatureOidcEnabled,
        "feature.email_enabled" => SettingKey::FeatureEmailEnabled,
        "auto_update_enabled" => SettingKey::AutoUpdateEnabled,
        "uploads.delete.retention.days" => SettingKey::Raw("uploads.delete.retention.days"),
        "avatar.max_dim" => SettingKey::AvatarMaxDim,
        "upload.image.max_dim" => SettingKey::UploadImageMaxDim,
        other => SettingKey::Raw(other),
    }
}

pub fn validate_setting(key: &str, value: &serde_json::Value) -> Result<(), Vec<String>> {
    let mut errs: Vec<String> = Vec::new();
    match classify(key) {
        SettingKey::DiscordWebhook => {
            if let Some(s) = value.as_str() {
                if !s.is_empty() && !s.starts_with("https://") {
                    errs.push("discord_webhook_url must be https URL".into());
                }
            } else if !value.is_null() {
                errs.push("discord_webhook_url must be string or null".into());
            }
        }
        SettingKey::FeatureFlags => {
            if !value.is_object() {
                errs.push("feature.flags must be object".into());
            }
        }
        SettingKey::OidcProviders => {
            if let Some(arr) = value.as_array() {
                for (i, item) in arr.iter().enumerate() {
                    if !item.is_object() {
                        errs.push(format!("oidc.providers[{i}] must be object"));
                        continue;
                    }
                    let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    if id.is_empty() {
                        errs.push(format!("oidc.providers[{i}].id required"));
                    }
                    let issuer = item.get("issuer").and_then(|v| v.as_str()).unwrap_or("");
                    if issuer.is_empty() {
                        errs.push(format!("oidc.providers[{i}].issuer required"));
                    }
                    let client_id = item.get("client_id").and_then(|v| v.as_str()).unwrap_or("");
                    if client_id.is_empty() {
                        errs.push(format!("oidc.providers[{i}].client_id required"));
                    }
                }
            } else {
                errs.push("oidc.providers must be array".into());
            }
        }
        SettingKey::Redis => {
            if let Some(obj) = value.as_object() {
                if let Some(url) = obj.get("url") {
                    if !url
                        .as_str()
                        .map(|s| s.starts_with("redis://") || s.starts_with("rediss://"))
                        .unwrap_or(false)
                    {
                        errs.push(
                            "redis.settings.url must start with redis:// or rediss://".into(),
                        );
                    }
                } else {
                    errs.push("redis.settings.url required".into());
                }
            } else {
                errs.push("redis.settings must be object".into());
            }
        }
        SettingKey::AppUploadDir => {
            if let Some(s) = value.as_str() {
                if s.trim().is_empty() {
                    errs.push("app.upload_dir must be non-empty".into());
                }
            } else {
                errs.push("app.upload_dir must be string".into());
            }
        }
        SettingKey::FeatureOidcEnabled
        | SettingKey::FeatureEmailEnabled
        | SettingKey::AutoUpdateEnabled => {
            if !value.is_boolean()
                && !matches!(
                    value.as_str(),
                    Some("1") | Some("0") | Some("true") | Some("false") | Some("yes") | Some("no")
                )
            {
                errs.push(format!("{} must be boolean or boolean string", key));
            }
        }
        SettingKey::AvatarMaxDim | SettingKey::UploadImageMaxDim => {
            if let Some(n) = value.as_u64() {
                if n == 0 || n > 10000 {
                    errs.push(format!("{} must be between 1 and 10000", key));
                }
            } else if let Some(s) = value.as_str() {
                if s.parse::<u32>()
                    .ok()
                    .filter(|v| *v > 0 && *v <= 10000)
                    .is_none()
                {
                    errs.push(format!(
                        "{} must be numeric string between 1 and 10000",
                        key
                    ));
                }
            } else {
                errs.push(format!("{} must be number", key));
            }
        }
        SettingKey::Raw(_) => { /* pass-through */ }
    }
    if key == "uploads.delete.retention.days" {
        if let Some(n) = value.as_i64() {
            if n < 0 || n > 3650 {
                errs.push("uploads.delete.retention.days must be 0..3650".into());
            }
        } else if let Some(s) = value.as_str() {
            if s.parse::<i64>()
                .ok()
                .filter(|v| *v >= 0 && *v <= 3650)
                .is_none()
            {
                errs.push("uploads.delete.retention.days must be integer 0..3650".into());
            }
        } else {
            errs.push("uploads.delete.retention.days must be integer".into());
        }
    }
    if key == "uploads.count_cache.ttl_secs" || key == "uploads.upload_dir_cache.ttl_secs" {
        if let Some(n) = value.as_i64() {
            if n < 1 || n > 3600 {
                errs.push(format!("{} must be between 1 and 3600", key));
            }
        } else if let Some(s) = value.as_str() {
            if s.parse::<i64>()
                .ok()
                .filter(|v| *v >= 1 && *v <= 3600)
                .is_none()
            {
                errs.push(format!("{} must be integer 1..3600", key));
            }
        } else {
            errs.push(format!("{} must be integer", key));
        }
    }
    if key == "uploads.gc.days" {
        if let Some(n) = value.as_i64() {
            if n < 1 || n > 365 {
                errs.push("uploads.gc.days must be 1..365".into());
            }
        } else if let Some(s) = value.as_str() {
            if s.parse::<i64>()
                .ok()
                .filter(|v| *v >= 1 && *v <= 365)
                .is_none()
            {
                errs.push("uploads.gc.days must be integer 1..365".into());
            }
        } else {
            errs.push("uploads.gc.days must be integer".into());
        }
    }
    if errs.is_empty() {
        Ok(())
    } else {
        Err(errs)
    }
}

impl FeatureFlags {
    pub fn is_oidc_enabled_default() -> bool {
        true
    }
    pub fn is_email_enabled_default() -> bool {
        false
    }
}

pub fn bool_from_setting(db_val: Option<&str>, default: bool) -> bool {
    db_val
        .and_then(|s| s.parse::<bool>().ok())
        .unwrap_or(default)
}
