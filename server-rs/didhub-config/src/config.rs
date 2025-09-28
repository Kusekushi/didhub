use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs;
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
        if let Some(path) = cfg_file_path.as_ref() {
            if Path::new(path).exists() {
                match load_config_file(path) {
                    Ok(cfg_file) => {
                        let config_dir = std::path::Path::new(path)
                            .parent()
                            .unwrap_or(std::path::Path::new("."));
                        if let Some(url_opt) = cfg_file.database.and_then(|db| {
						// Reuse existing logic by reconstructing the DB url from the parsed DatabaseSection
						// This mirrors the old load_db_url_from_file behavior.
						let driver_lc = db.driver.to_lowercase();
						match driver_lc.as_str() {
							"sqlite" => {
								let p = db.path.unwrap_or_else(|| "./data/didhub.sqlite".into());
								let config_dir = std::path::Path::new(path).parent().unwrap_or(std::path::Path::new("."));
								let abs = normalize_path(&p, config_dir);
								Some(format!("sqlite://{abs}"))
							}
							"postgres" | "postgresql" => {
								let host = db.host.unwrap_or_else(|| "localhost".into());
								let port = db.port.unwrap_or(5432);
								let database = db.database.unwrap_or_else(|| "didhub".into());
								let user = db.username.unwrap_or_else(|| "didhub".into());
								let pass = db.password.unwrap_or_else(|| "didhub".into());
								if database.is_empty() || user.is_empty() { None } else {
									let mut url = format!("postgres://{user}:{pass}@{host}:{port}/{database}");
									if let Some(ssl) = db.ssl_mode {
										let ssl_lc = ssl.to_lowercase();
										let allowed = ["disable","require","verify-ca","verify-full"];
										if !ssl_lc.is_empty() && allowed.contains(&ssl_lc.as_str()) {
											url.push_str(&format!("?sslmode={ssl_lc}"));
										}
									}
									Some(url)
								}
							}
							"mysql" => {
								let host = db.host.unwrap_or_else(|| "localhost".into());
								let port = db.port.unwrap_or(3306);
								let database = db.database.unwrap_or_else(|| "didhub".into());
								let user = db.username.unwrap_or_else(|| "didhub".into());
								let pass = db.password.unwrap_or_else(|| "didhub".into());
								if database.is_empty() || user.is_empty() { None } else { Some(format!("mysql://{user}:{pass}@{host}:{port}/{database}")) }
							}
							_ => { tracing::warn!(target="didhub_server", driver=%db.driver, "unsupported database driver in config file"); None }
						}
					}) { file_db_url = Some(url_opt); }
                        if let Some(logging) = cfg_file.logging {
                            file_log_level = logging.level;
                            file_log_json = logging.json;
                        }
                        if let Some(uploads) = cfg_file.uploads {
                            if let Some(dir) = uploads.directory {
                                file_upload_dir = Some(normalize_path(&dir, config_dir));
                            }
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
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
        let port = std::env::var("PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(6000);
        let jwt_secret =
            std::env::var("DIDHUB_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
        let allow_all_frontend_origins = std::env::var("ALLOW_ALL_FRONTEND_ORIGINS")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        let raw_origins = std::env::var("FRONTEND_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:5173,http://localhost:5174".into());
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
        let redis_url = std::env::var("DIDHUB_REDIS_URL").ok();
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
            .unwrap_or(false);
        let auto_update_check = std::env::var("AUTO_UPDATE_CHECK")
            .ok()
            .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        let update_repo =
            std::env::var("UPDATE_REPO").unwrap_or_else(|_| "Kusekushi/didhub".into());
        let update_check_interval_hours = std::env::var("UPDATE_CHECK_INTERVAL_HOURS")
            .ok()
            .and_then(|s| s.parse().ok())
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
}

#[derive(Debug, Deserialize)]
struct RawConfigFile {
    #[serde(default)]
    database: Option<DatabaseSection>,
    #[serde(default)]
    logging: Option<LoggingSection>,
    #[serde(default)]
    uploads: Option<UploadsSection>,
}

#[derive(Debug, Deserialize)]
struct LoggingSection {
    #[serde(default)]
    level: Option<String>,
    #[serde(default)]
    json: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct DatabaseSection {
    driver: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    database: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    ssl_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UploadsSection {
    #[serde(default)]
    directory: Option<String>,
}

fn load_config_file(path: &str) -> Result<RawConfigFile> {
    let raw = fs::read_to_string(path).with_context(|| format!("reading config file {path}"))?;
    let parsed: RawConfigFile =
        serde_json::from_str(&raw).with_context(|| format!("parsing json config {path}"))?;
    Ok(parsed)
}

fn normalize_path(p: &str, base: &std::path::Path) -> String {
    use std::path::PathBuf;
    let mut pb = PathBuf::from(p);
    if pb.is_relative() {
        pb = base.join(pb);
    }
    pb.to_string_lossy().replace('\\', "/")
}

fn parse_origin_list(raw: &str) -> Vec<String> {
    // Accept JSON array or comma-separated list
    let trimmed = raw.trim();
    if trimmed.starts_with('[') {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(arr) = v.as_array() {
                return arr
                    .iter()
                    .filter_map(|x| x.as_str())
                    .map(|s| normalize_origin(s))
                    .collect();
            }
        }
    }
    trimmed
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(normalize_origin)
        .collect()
}

fn normalize_origin(s: &str) -> String {
    if let Ok(u) = url::Url::parse(s) {
        u.origin().ascii_serialization()
    } else {
        s.trim_end_matches('/').to_string()
    }
}
