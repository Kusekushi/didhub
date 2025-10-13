use crate::structs::*;
use crate::utils::*;
use anyhow::Result;
use config::{Config, File};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub jwt_secret: String,
    pub allow_all_frontend_origins: bool,
    pub frontend_origins: Vec<String>,
    pub log_json: bool,
    pub log_level: Option<String>,
    pub bootstrap_admin_username: Option<String>,
    pub bootstrap_admin_password: Option<String>,
    pub upload_dir: String,
    pub redis_url: Option<String>,
    pub content_security_policy: Option<String>,
    pub enable_hsts: bool,
    pub db_url: Option<String>,
    // Update configuration
    pub auto_update_enabled: bool,
    pub auto_update_check: bool,
    pub update_repo: String,
    pub update_check_interval_hours: u64,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        // Optional: load config file for database parameters unless env overrides
        let cfg_file_path = std::env::var("DIDHUB_DB_CONFIG")
            .ok()
            .or_else(|| std::env::var("DIDHUB_CONFIG_FILE").ok());
        let mut file_db_url: Option<String> = None;
        let mut file_log_level: Option<String> = None;
        let mut file_log_json: Option<bool> = None;
        let mut file_upload_dir: Option<String> = None;
        let mut file_host: Option<String> = None;
        let mut file_port: Option<u16> = None;
        let mut file_allow_all_origins: Option<bool> = None;
        let mut file_frontend_origins: Option<Vec<String>> = None;
        let mut file_redis_url: Option<String> = None;
        let mut file_auto_update_enabled: Option<bool> = None;
        let mut file_auto_update_check: Option<bool> = None;
        let mut file_update_repo: Option<String> = None;
        let mut file_update_check_interval_hours: Option<u64> = None;
        if let Some(path) = cfg_file_path.as_ref() {
            if Path::new(path).exists() {
                match Config::builder().add_source(File::with_name(path)).build() {
                    Ok(cfg_file) => {
                        let config_dir = std::path::Path::new(path)
                            .parent()
                            .unwrap_or(std::path::Path::new("."));

                        // Extract database section
                        if let Ok(db) = cfg_file.get::<DatabaseSection>("database") {
                            if let Some(url_opt) = {
                                // Reuse existing logic by reconstructing the DB url from the parsed DatabaseSection
                                // This mirrors the old load_db_url_from_file behavior.
                                let driver_lc = db.driver.to_lowercase();
                                match driver_lc.as_str() {
                                    "sqlite" => {
                                        let p = db
                                            .path
                                            .unwrap_or_else(|| "./data/didhub.sqlite".into());
                                        let abs = normalize_path(&p, config_dir);
                                        Some(format!("sqlite://{abs}"))
                                    }
                                    "postgres" | "postgresql" => {
                                        let host = db.host.unwrap_or_else(|| "localhost".into());
                                        let port = db.port.unwrap_or(5432);
                                        let database =
                                            db.database.unwrap_or_else(|| "didhub".into());
                                        let user = db.username.unwrap_or_else(|| "didhub".into());
                                        let pass = db.password.unwrap_or_else(|| "didhub".into());
                                        if database.is_empty() || user.is_empty() {
                                            None
                                        } else {
                                            let mut url = format!(
                                                "postgres://{user}:{pass}@{host}:{port}/{database}"
                                            );
                                            if let Some(ssl) = db.ssl_mode {
                                                let ssl_lc = ssl.to_lowercase();
                                                let allowed = [
                                                    "disable",
                                                    "require",
                                                    "verify-ca",
                                                    "verify-full",
                                                ];
                                                if !ssl_lc.is_empty()
                                                    && allowed.contains(&ssl_lc.as_str())
                                                {
                                                    url.push_str(&format!("?sslmode={ssl_lc}"));
                                                }
                                            }
                                            Some(url)
                                        }
                                    }
                                    "mysql" => {
                                        let host = db.host.unwrap_or_else(|| "localhost".into());
                                        let port = db.port.unwrap_or(3306);
                                        let database =
                                            db.database.unwrap_or_else(|| "didhub".into());
                                        let user = db.username.unwrap_or_else(|| "didhub".into());
                                        let pass = db.password.unwrap_or_else(|| "didhub".into());
                                        if database.is_empty() || user.is_empty() {
                                            None
                                        } else {
                                            Some(format!(
                                                "mysql://{user}:{pass}@{host}:{port}/{database}"
                                            ))
                                        }
                                    }
                                    _ => {
                                        tracing::warn!(target="didhub_server", driver=%db.driver, "unsupported database driver in config file");
                                        None
                                    }
                                }
                            } {
                                file_db_url = Some(url_opt);
                            }
                        }

                        // Extract logging section
                        if let Ok(logging) = cfg_file.get::<LoggingSection>("logging") {
                            file_log_level = logging.level;
                            file_log_json = logging.json;
                        }

                        // Extract uploads section
                        if let Ok(uploads) = cfg_file.get::<UploadsSection>("uploads") {
                            if let Some(dir) = uploads.directory {
                                file_upload_dir = Some(normalize_path(&dir, config_dir));
                            }
                        }

                        // Extract server section
                        if let Ok(server) = cfg_file.get::<ServerSection>("server") {
                            file_host = server.host;
                            file_port = server.port;
                        }

                        // Extract cors section
                        if let Ok(cors) = cfg_file.get::<CorsSection>("cors") {
                            file_allow_all_origins = cors.allow_all_origins;
                            file_frontend_origins = cors.allowed_origins;
                        }

                        // Extract redis section
                        if let Ok(redis) = cfg_file.get::<RedisSection>("redis") {
                            file_redis_url = redis.url;
                        }

                        // Extract auto_update section
                        if let Ok(auto_update) = cfg_file.get::<AutoUpdateSection>("auto_update") {
                            file_auto_update_enabled = auto_update.enabled;
                            file_auto_update_check = auto_update.check_enabled;
                            file_update_repo = auto_update.repo;
                            file_update_check_interval_hours = auto_update.check_interval_hours;
                        }
                    }
                    Err(e) => {
                        tracing::warn!(target="didhub_server", error=%e, "failed parsing config file");
                    }
                };
            } else {
                tracing::warn!(target="didhub_server", path=%path, "db config file path does not exist");
            }
        }
        // If DIDHUB_DB env already present it wins; otherwise we can export file-derived url so existing Db::connect() works
        let env_db = std::env::var("DIDHUB_DB").ok();
        if env_db.is_none() {
            if let Some(ref url) = file_db_url {
                std::env::set_var("DIDHUB_DB", url);
            }
        }
        let host = std::env::var("HOST")
            .ok()
            .or(file_host)
            .unwrap_or_else(|| "0.0.0.0".into());
        let port = std::env::var("PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(file_port)
            .unwrap_or(6000);
        let jwt_secret =
            std::env::var("DIDHUB_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
        let allow_all_frontend_origins = std::env::var("ALLOW_ALL_FRONTEND_ORIGINS")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .or(file_allow_all_origins)
            .unwrap_or(false);
        let raw_origins = std::env::var("FRONTEND_BASE_URL").unwrap_or_else(|_| {
            file_frontend_origins
                .as_ref()
                .map(|origins| origins.join(","))
                .unwrap_or_else(|| "http://localhost:5173,http://localhost:5174".into())
        });
        let frontend_origins = parse_origin_list(&raw_origins);
        // Determine JSON log formatting preference: env var overrides file, otherwise file value or default
        let log_json = std::env::var("LOG_FORMAT")
            .ok()
            .map(|v| v.to_lowercase() == "json")
            .or(file_log_json)
            .unwrap_or(false);

        // Determine log level: precedence env RUST_LOG -> env LOG_LEVEL -> config file -> default
        let env_rust_log = std::env::var("RUST_LOG").ok();
        let env_log_level = std::env::var("LOG_LEVEL").ok();
        let log_level = env_rust_log.or(env_log_level).or(file_log_level.clone());
        // If only LOG_LEVEL or file_log_level provided, normalize into RUST_LOG so tracing subscriber picks it up
        if std::env::var("RUST_LOG").is_err() {
            if let Some(ref lvl) = log_level {
                std::env::set_var("RUST_LOG", lvl);
            }
        }
        let bootstrap_admin_username = std::env::var("DIDHUB_BOOTSTRAP_ADMIN_USERNAME").ok();
        let bootstrap_admin_password = std::env::var("DIDHUB_BOOTSTRAP_ADMIN_PASSWORD").ok();
        let upload_dir = std::env::var("UPLOAD_DIR")
            .ok()
            .or(file_upload_dir.clone())
            .unwrap_or_else(|| "uploads".into());
        if std::env::var("UPLOAD_DIR").is_err() {
            std::env::set_var("UPLOAD_DIR", upload_dir.clone());
        }
        let redis_url = std::env::var("DIDHUB_REDIS_URL").ok().or(file_redis_url);
        let content_security_policy = std::env::var("DIDHUB_CSP").ok();
        let enable_hsts = std::env::var("DIDHUB_ENABLE_HSTS")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        let db_url = env_db.or(file_db_url);

        // Update configuration - all disabled by default for safety
        let auto_update_enabled = std::env::var("AUTO_UPDATE_ENABLED")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .or(file_auto_update_enabled)
            .unwrap_or(false);
        let auto_update_check = std::env::var("AUTO_UPDATE_CHECK")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .or(file_auto_update_check)
            .unwrap_or(false);
        let update_repo = std::env::var("UPDATE_REPO")
            .ok()
            .or(file_update_repo)
            .unwrap_or_else(|| "Kusekushi/didhub".into());
        let update_check_interval_hours = std::env::var("UPDATE_CHECK_INTERVAL_HOURS")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(file_update_check_interval_hours)
            .unwrap_or(24);

        Ok(Self {
            host,
            port,
            jwt_secret,
            allow_all_frontend_origins,
            frontend_origins,
            log_json,
            log_level: log_level.clone(),
            bootstrap_admin_username,
            bootstrap_admin_password,
            upload_dir,
            redis_url,
            content_security_policy,
            enable_hsts,
            db_url,
            auto_update_enabled,
            auto_update_check,
            update_repo,
            update_check_interval_hours,
        })
    }

    pub fn default_for_tests() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 0,
            jwt_secret: "test-secret".into(),
            allow_all_frontend_origins: true,
            frontend_origins: vec!["http://localhost".into()],
            log_json: false,
            log_level: None,
            bootstrap_admin_username: None,
            bootstrap_admin_password: None,
            upload_dir: "uploads".into(),
            redis_url: None,
            content_security_policy: None,
            enable_hsts: false,
            db_url: None,
            auto_update_enabled: false,
            auto_update_check: false,
            update_repo: "Kusekushi/didhub".into(),
            update_check_interval_hours: 24,
        }
    }

    /// Validates the configuration for production use
    pub fn validate(&self) -> Result<()> {
        // Check JWT secret
        if self.jwt_secret == "dev-secret-change-me" || self.jwt_secret.len() < 32 {
            return Err(anyhow::anyhow!(
                "DIDHUB_SECRET must be set to a secure random string of at least 32 characters"
            ));
        }

        // Check database URL
        if self.db_url.is_none() {
            return Err(anyhow::anyhow!(
                "Database URL must be configured via DIDHUB_DB or config file"
            ));
        }

        // Check upload directory
        if self.upload_dir.is_empty() {
            return Err(anyhow::anyhow!("Upload directory cannot be empty"));
        }

        // Check frontend origins
        if !self.allow_all_frontend_origins && self.frontend_origins.is_empty() {
            return Err(anyhow::anyhow!(
                "Frontend origins must be configured when ALLOW_ALL_FRONTEND_ORIGINS is false"
            ));
        }

        // Check port range
        if self.port == 0 { // self.port > 65535 is checked by bounds
            return Err(anyhow::anyhow!("Port must be between 1 and 65535"));
        }

        // Check update interval
        if self.update_check_interval_hours == 0 {
            return Err(anyhow::anyhow!(
                "Update check interval must be greater than 0 hours"
            ));
        }

        Ok(())
    }

    /// Returns a summary of the current configuration for logging
    pub fn summary(&self) -> String {
        format!(
            "host={}, port={}, db_configured={}, redis_configured={}, auto_update_enabled={}, log_level={}",
            self.host,
            self.port,
            self.db_url.is_some(),
            self.redis_url.is_some(),
            self.auto_update_enabled,
            self.log_level.as_deref().unwrap_or("default")
        )
    }
}
