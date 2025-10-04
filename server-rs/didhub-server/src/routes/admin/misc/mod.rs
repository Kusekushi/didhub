mod check_updates;
mod migrate_uploads;
mod perform_update_endpoint;
mod post_custom_digest;
mod query_database;
mod redis_status;
mod reload_upload_dir;

pub use check_updates::check_updates;
pub use migrate_uploads::{migrate_uploads, MigrateResp};
pub use perform_update_endpoint::perform_update_endpoint;
pub use post_custom_digest::{post_custom_digest, CustomDigestQuery, DigestResponse};
pub use query_database::{query_database, QueryRequest, QueryResponse};
pub use redis_status::{redis_status, RedisStatusResp};
pub use reload_upload_dir::{reload_upload_dir, ReloadResp};

#[cfg(feature = "updater")]
pub use didhub_updater::{UpdateResult, UpdateStatus};

include!(concat!(env!("OUT_DIR"), "/versions.rs"));

#[derive(serde::Deserialize)]
pub struct UpdateCheckQuery {
    #[serde(default)]
    pub check_only: bool,
}

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct VersionInfo {
    pub server: String,
    pub db: String,
    pub auth: String,
    pub cache: String,
    pub error: String,
    pub config: String,
    pub oidc: String,
    pub metrics: String,
    pub housekeeping: String,
    pub middleware: String,
    pub updater: String,
    pub migrations: String,
    pub frontend: String,
}

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct UpdateStatus {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub message: String,
    pub versions: VersionInfo,
}

#[cfg(not(feature = "updater"))]
#[derive(Debug, serde::Serialize)]
pub struct UpdateResult {
    pub success: bool,
    pub message: String,
    pub version_updated: Option<String>,
    pub restart_needed: bool,
}

#[cfg(not(feature = "updater"))]
pub(crate) fn get_version_info() -> VersionInfo {
    VersionInfo {
        server: SERVER_VERSION.to_string(),
        db: DB_VERSION.to_string(),
        auth: AUTH_VERSION.to_string(),
        cache: CACHE_VERSION.to_string(),
        error: ERROR_VERSION.to_string(),
        config: CONFIG_VERSION.to_string(),
        oidc: OIDC_VERSION.to_string(),
        metrics: METRICS_VERSION.to_string(),
        housekeeping: HOUSEKEEPING_VERSION.to_string(),
        middleware: MIDDLEWARE_VERSION.to_string(),
        updater: UPDATER_VERSION.to_string(),
        migrations: MIGRATIONS_VERSION.to_string(),
        frontend: FRONTEND_VERSION.to_string(),
    }
}
