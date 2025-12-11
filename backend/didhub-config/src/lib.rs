use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;

/// Pre-compiled regex for hostname validation (compiled once at first use)
static HOSTNAME_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-zA-Z0-9][-a-zA-Z0-9\.]*[a-zA-Z0-9]$").unwrap());

#[derive(Debug, Deserialize)]
pub struct RawConfigFile {
    #[serde(default)]
    pub database: Option<DatabaseSection>,
    #[serde(default)]
    pub server: Option<ServerSection>,
    #[serde(default)]
    pub logging: Option<LoggingSection>,
    #[serde(default)]
    pub cors: Option<CorsSection>,
    #[serde(default)]
    pub uploads: Option<UploadsSection>,
    #[serde(default)]
    pub auto_update: Option<AutoUpdateSection>,
    #[serde(default)]
    pub rate_limit: Option<RateLimitSection>,
    #[serde(default)]
    pub auth: Option<AuthSection>,
}

#[derive(Debug, Deserialize)]
pub struct RateLimitSection {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub per_ip: Option<bool>,
    #[serde(default)]
    pub per_user: Option<bool>,
    #[serde(default)]
    pub rate_per_sec: Option<f64>,
    #[serde(default)]
    pub burst: Option<usize>,
    #[serde(default)]
    pub exempt_paths: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct LoggingSection {
    #[serde(default)]
    pub level: Option<String>,
    #[serde(default)]
    pub json: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ServerSection {
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
}

#[derive(Debug, Deserialize)]
pub struct CorsSection {
    #[serde(default)]
    pub allowed_origins: Option<Vec<String>>,
    #[serde(default)]
    pub allow_all_origins: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseSection {
    pub driver: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub database: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub ssl_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UploadsSection {
    #[serde(default)]
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AutoUpdateSection {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub check_enabled: Option<bool>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub check_interval_hours: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct AuthSection {
    #[serde(default)]
    pub jwt_pem: Option<String>,
    #[serde(default)]
    pub jwt_pem_path: Option<String>,
    #[serde(default)]
    pub jwt_secret: Option<String>,
}

#[derive(thiserror::Error, Debug)]
pub enum ConfigError {
    #[error("Io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Validation error: {0}")]
    Validation(String),
}

/// Load a RawConfigFile from a path. The format is inferred from the extension: .toml, .yaml/.yml, .json
pub fn load_raw_from_file<P: AsRef<Path>>(path: P) -> Result<RawConfigFile, ConfigError> {
    let path = path.as_ref();
    let s = fs::read_to_string(path)?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase());
    parse_config_str(&s, ext.as_deref())
}

/// Parse configuration from a string with optional format hint
#[inline]
fn parse_config_str(s: &str, ext: Option<&str>) -> Result<RawConfigFile, ConfigError> {
    match ext {
        #[cfg(feature = "toml")]
        Some("toml") => toml::from_str(s).map_err(|e| ConfigError::Parse(e.to_string())),
        #[cfg(feature = "yaml")]
        Some("yaml" | "yml") => {
            serde_yaml::from_str(s).map_err(|e| ConfigError::Parse(e.to_string()))
        }
        #[cfg(feature = "json")]
        Some("json") => serde_json::from_str(s).map_err(|e| ConfigError::Parse(e.to_string())),
        _ => parse_config_auto(s),
    }
}

/// Try to parse config by attempting each enabled format
#[inline]
fn parse_config_auto(s: &str) -> Result<RawConfigFile, ConfigError> {
    // Try each format in order, collecting the last error
    #[cfg(feature = "yaml")]
    if let Ok(cfg) = serde_yaml::from_str(s) {
        return Ok(cfg);
    }

    #[cfg(feature = "toml")]
    if let Ok(cfg) = toml::from_str(s) {
        return Ok(cfg);
    }

    #[cfg(feature = "json")]
    if let Ok(cfg) = serde_json::from_str(s) {
        return Ok(cfg);
    }

    // All formats failed - generate appropriate error message
    #[cfg(any(feature = "yaml", feature = "toml", feature = "json"))]
    {
        Err(ConfigError::Parse(
            "failed to parse config as any supported format".into(),
        ))
    }

    #[cfg(not(any(feature = "yaml", feature = "toml", feature = "json")))]
    {
        let _ = s; // suppress unused warning
        Err(ConfigError::Parse("no config format enabled".into()))
    }
}

/// Concrete application configuration with defaults.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub logging: LoggingConfig,
    pub cors: CorsConfig,
    pub redis_url: Option<String>,
    pub database: DatabaseConfig,
    pub uploads: UploadsConfig,
    pub auto_update: AutoUpdateConfig,
    pub rate_limit: RateLimitConfig,
    pub auth: AuthConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LoggingConfig {
    pub level: String,
    pub json: bool,
    pub log_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CorsConfig {
    pub allowed_origins: Vec<String>,
    pub allow_all_origins: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DatabaseConfig {
    pub driver: String,
    pub path: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub ssl_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UploadsConfig {
    pub directory: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AutoUpdateConfig {
    pub enabled: bool,
    pub check_enabled: bool,
    pub repo: Option<String>,
    pub check_interval_hours: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RateLimitConfig {
    pub enabled: bool,
    pub per_ip: bool,
    pub per_user: bool,
    pub rate_per_sec: f64,
    pub burst: usize,
    pub exempt_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AuthConfig {
    pub jwt_pem: Option<String>,
    pub jwt_pem_path: Option<String>,
    pub jwt_secret: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 6000,
            },
            logging: LoggingConfig {
                level: "info".to_string(),
                json: false,
                log_dir: None,
            },
            cors: CorsConfig {
                allowed_origins: Vec::new(),
                allow_all_origins: false,
            },
            redis_url: None,
            database: DatabaseConfig {
                driver: "sqlite".to_string(),
                path: Some("didhub.sqlite".to_string()),
                host: None,
                port: None,
                database: None,
                username: None,
                password: None,
                ssl_mode: None,
            },
            uploads: UploadsConfig {
                directory: "./uploads".to_string(),
            },
            auto_update: AutoUpdateConfig {
                enabled: false,
                check_enabled: false,
                repo: None,
                check_interval_hours: 24,
            },
            auth: AuthConfig {
                jwt_pem: None,
                jwt_pem_path: None,
                jwt_secret: None,
            },
            rate_limit: RateLimitConfig {
                enabled: false,
                per_ip: true,
                per_user: true,
                rate_per_sec: 100.0,
                burst: 200,
                exempt_paths: vec![
                    "/health".to_string(),
                    "/ready".to_string(),
                    "/csrf-token".to_string(),
                ],
            },
        }
    }
}

#[inline]
fn parse_bool(s: &str) -> Result<bool, ()> {
    // Avoid allocation by checking bytes directly for common cases
    let bytes = s.as_bytes();
    match bytes {
        b"1" | b"true" | b"TRUE" | b"True" | b"yes" | b"YES" | b"Yes" | b"y" | b"Y" => Ok(true),
        b"0" | b"false" | b"FALSE" | b"False" | b"no" | b"NO" | b"No" | b"n" | b"N" => Ok(false),
        _ => {
            // Fallback for mixed case
            match s.to_ascii_lowercase().as_str() {
                "true" | "yes" | "y" => Ok(true),
                "false" | "no" | "n" => Ok(false),
                _ => Err(()),
            }
        }
    }
}

#[inline]
fn split_csv(s: &str) -> Vec<String> {
    s.split(',')
        .filter_map(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect()
}

/// Helper macro to apply optional value if present
macro_rules! apply_opt {
    ($target:expr, $source:expr) => {
        if let Some(v) = $source {
            $target = v;
        }
    };
    ($target:expr, $source:expr, wrap) => {
        if let Some(v) = $source {
            $target = Some(v);
        }
    };
}

/// Helper macro to apply option field directly if it has a value
macro_rules! apply_opt_field {
    ($target:expr, $source:expr) => {
        if $source.is_some() {
            $target = $source;
        }
    };
}

/// Load concrete `Config` from optional file and environment variables.
/// Environment variables take precedence over file values and defaults.
pub fn load_config<P: AsRef<Path>>(path: Option<P>) -> Result<Config, ConfigError> {
    let mut cfg = Config::default();

    // Start with file values if provided
    if let Some(p) = path {
        let raw = load_raw_from_file(p)?;
        if let Some(server) = raw.server {
            apply_opt!(cfg.server.host, server.host);
            apply_opt!(cfg.server.port, server.port);
        }
        if let Some(logging) = raw.logging {
            apply_opt!(cfg.logging.level, logging.level);
            apply_opt!(cfg.logging.json, logging.json);
        }
        if let Some(cors) = raw.cors {
            apply_opt!(cfg.cors.allowed_origins, cors.allowed_origins);
            apply_opt!(cfg.cors.allow_all_origins, cors.allow_all_origins);
        }
        if let Some(db) = raw.database {
            cfg.database.driver = db.driver;
            apply_opt_field!(cfg.database.path, db.path);
            apply_opt_field!(cfg.database.host, db.host);
            apply_opt_field!(cfg.database.port, db.port);
            apply_opt_field!(cfg.database.database, db.database);
            apply_opt_field!(cfg.database.username, db.username);
            apply_opt_field!(cfg.database.password, db.password);
            apply_opt_field!(cfg.database.ssl_mode, db.ssl_mode);
        }
        if let Some(uploads) = raw.uploads {
            apply_opt!(cfg.uploads.directory, uploads.directory);
        }
        if let Some(a) = raw.auto_update {
            apply_opt!(cfg.auto_update.enabled, a.enabled);
            apply_opt!(cfg.auto_update.check_enabled, a.check_enabled);
            apply_opt!(cfg.auto_update.repo, a.repo, wrap);
            apply_opt!(cfg.auto_update.check_interval_hours, a.check_interval_hours);
        }
        if let Some(auth) = raw.auth {
            apply_opt!(cfg.auth.jwt_pem, auth.jwt_pem, wrap);
            apply_opt!(cfg.auth.jwt_pem_path, auth.jwt_pem_path, wrap);
            apply_opt!(cfg.auth.jwt_secret, auth.jwt_secret, wrap);
        }
        if let Some(rl) = raw.rate_limit {
            apply_opt!(cfg.rate_limit.enabled, rl.enabled);
            apply_opt!(cfg.rate_limit.per_ip, rl.per_ip);
            apply_opt!(cfg.rate_limit.per_user, rl.per_user);
            apply_opt!(cfg.rate_limit.rate_per_sec, rl.rate_per_sec);
            apply_opt!(cfg.rate_limit.burst, rl.burst);
            apply_opt!(cfg.rate_limit.exempt_paths, rl.exempt_paths);
        }
    }

    // Apply environment variable overrides (env takes precedence)
    apply_env_overrides(&mut cfg)?;

    Ok(cfg)
}

/// Helper to parse env var as a specific type
#[inline]
fn env_parse<T: std::str::FromStr>(key: &str) -> Result<Option<T>, ConfigError>
where
    T::Err: std::fmt::Display,
{
    match env::var(key) {
        Ok(v) => v
            .parse::<T>()
            .map(Some)
            .map_err(|e| ConfigError::Parse(format!("invalid {}: {}", key, e))),
        Err(_) => Ok(None),
    }
}

/// Helper to parse env var as bool
#[inline]
fn env_bool(key: &str) -> Result<Option<bool>, ConfigError> {
    match env::var(key) {
        Ok(v) => parse_bool(&v)
            .map(Some)
            .map_err(|_| ConfigError::Parse(format!("invalid {}", key))),
        Err(_) => Ok(None),
    }
}

/// Helper to get env var as string
#[inline]
fn env_str(key: &str) -> Option<String> {
    env::var(key).ok()
}

/// Apply all environment variable overrides to config
fn apply_env_overrides(cfg: &mut Config) -> Result<(), ConfigError> {
    // Server
    if let Some(v) = env_str("DIDHUB_SERVER_HOST") {
        cfg.server.host = v;
    }
    if let Some(v) = env_parse::<u16>("DIDHUB_SERVER_PORT")? {
        cfg.server.port = v;
    }

    // Logging
    if let Some(v) = env_str("DIDHUB_LOG_LEVEL") {
        cfg.logging.level = v;
    }
    if let Some(v) = env_bool("DIDHUB_LOG_JSON")? {
        cfg.logging.json = v;
    }
    if let Some(v) = env_str("DIDHUB_LOG_DIR") {
        cfg.logging.log_dir = Some(v);
    }

    // CORS
    if let Some(v) = env_str("DIDHUB_CORS_ALLOWED_ORIGINS") {
        cfg.cors.allowed_origins = split_csv(&v);
    }
    if let Some(v) = env_bool("DIDHUB_CORS_ALLOW_ALL_ORIGINS")? {
        cfg.cors.allow_all_origins = v;
    }

    // Redis
    if let Some(v) = env_str("DIDHUB_REDIS_URL") {
        cfg.redis_url = Some(v);
    }

    // Rate limiting
    if let Some(v) = env_bool("DIDHUB_RATE_LIMIT_ENABLED")? {
        cfg.rate_limit.enabled = v;
    }
    if let Some(v) = env_bool("DIDHUB_RATE_LIMIT_PER_IP")? {
        cfg.rate_limit.per_ip = v;
    }
    if let Some(v) = env_bool("DIDHUB_RATE_LIMIT_PER_USER")? {
        cfg.rate_limit.per_user = v;
    }
    if let Some(v) = env_parse::<f64>("DIDHUB_RATE_LIMIT_PER_SEC")? {
        cfg.rate_limit.rate_per_sec = v;
    }
    if let Some(v) = env_parse::<usize>("DIDHUB_RATE_LIMIT_BURST")? {
        cfg.rate_limit.burst = v;
    }
    if let Some(v) = env_str("DIDHUB_RATE_LIMIT_EXEMPT_PATHS") {
        cfg.rate_limit.exempt_paths = split_csv(&v);
    }

    // Database
    if let Some(v) = env_str("DIDHUB_DATABASE_DRIVER") {
        cfg.database.driver = v;
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_PATH") {
        cfg.database.path = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_HOST") {
        cfg.database.host = Some(v);
    }
    if let Some(v) = env_parse::<u16>("DIDHUB_DATABASE_PORT")? {
        cfg.database.port = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_NAME") {
        cfg.database.database = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_USERNAME") {
        cfg.database.username = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_PASSWORD") {
        cfg.database.password = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_DATABASE_SSL_MODE") {
        cfg.database.ssl_mode = Some(v);
    }
    // Backwards-compatible alias
    if let Some(v) = env_str("DIDHUB_DATABASE_URL") {
        cfg.database.path = Some(v);
    }

    // Uploads
    if let Some(v) = env_str("DIDHUB_UPLOADS_DIRECTORY") {
        cfg.uploads.directory = v;
    }

    // Auto-update
    if let Some(v) = env_bool("DIDHUB_AUTO_UPDATE_ENABLED")? {
        cfg.auto_update.enabled = v;
    }
    if let Some(v) = env_bool("DIDHUB_AUTO_UPDATE_CHECK_ENABLED")? {
        cfg.auto_update.check_enabled = v;
    }
    if let Some(v) = env_str("DIDHUB_AUTO_UPDATE_REPO") {
        cfg.auto_update.repo = Some(v);
    }
    if let Some(v) = env_parse::<u64>("DIDHUB_AUTO_UPDATE_CHECK_INTERVAL_HOURS")? {
        cfg.auto_update.check_interval_hours = v;
    }

    // Auth
    if let Some(v) = env_str("DIDHUB_JWT_PEM") {
        cfg.auth.jwt_pem = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_JWT_PEM_PATH") {
        cfg.auth.jwt_pem_path = Some(v);
    }
    if let Some(v) = env_str("DIDHUB_JWT_SECRET") {
        cfg.auth.jwt_secret = Some(v);
    }

    Ok(())
}

/// Validate higher-level constraints on the resolved configuration.
pub fn validate_config(cfg: &Config) -> Result<(), ConfigError> {
    // server port range
    if cfg.server.port == 0 {
        return Err(ConfigError::Validation("server.port must be > 0".into()));
    }
    // validate server.host: allow IPs or simple hostname pattern
    // Use pre-compiled regex for better performance
    let host_ok = cfg.server.host.parse::<std::net::IpAddr>().is_ok()
        || HOSTNAME_REGEX.is_match(&cfg.server.host);
    if !host_ok {
        return Err(ConfigError::Validation(format!(
            "invalid server.host: {}",
            cfg.server.host
        )));
    }

    // database driver supported
    match cfg.database.driver.as_str() {
        "sqlite" | "postgres" | "mysql" => {}
        other => {
            return Err(ConfigError::Validation(format!(
                "unsupported database driver: {}",
                other
            )))
        }
    }
    // non-sqlite must have host and database
    if cfg.database.driver != "sqlite" {
        if cfg
            .database
            .host
            .as_deref()
            .map(|s| s.is_empty())
            .unwrap_or(true)
        {
            return Err(ConfigError::Validation(
                "database.host must be set for non-sqlite drivers".to_string(),
            ));
        }
        if cfg
            .database
            .database
            .as_deref()
            .map(|s| s.is_empty())
            .unwrap_or(true)
        {
            return Err(ConfigError::Validation(
                "database.database must be set for non-sqlite drivers".to_string(),
            ));
        }
    }

    // Validate CORS allowed origins are valid URLs (if present)
    if !cfg.cors.allowed_origins.is_empty() {
        for origin in &cfg.cors.allowed_origins {
            if origin == "*" {
                continue;
            }
            match url::Url::parse(origin) {
                Ok(u) => {
                    let scheme = u.scheme();
                    if scheme != "http" && scheme != "https" {
                        return Err(ConfigError::Validation(format!(
                            "CORS origin must be http or https: {}",
                            origin
                        )));
                    }
                }
                Err(_) => {
                    return Err(ConfigError::Validation(format!(
                        "invalid CORS origin: {}",
                        origin
                    )))
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn parse_toml() {
        let f = NamedTempFile::new().expect("tmpfile");
        std::fs::write(
            f.path(),
            r#"
[server]
host = "127.0.0.1"
port = 6000

[database]
driver = "sqlite"
path = "db.sqlite"
"#,
        )
        .unwrap();
        let cfg = load_raw_from_file(f.path()).expect("load");
        assert!(cfg.server.is_some());
        assert!(cfg.database.is_some());
        let s = cfg.server.unwrap();
        assert_eq!(s.host.unwrap(), "127.0.0.1");
        assert_eq!(s.port.unwrap(), 6000);
    }

    #[test]
    fn parse_yaml() {
        let f = NamedTempFile::new().expect("tmpfile");
        std::fs::write(
            f.path(),
            r#"
server:
  host: 0.0.0.0
  port: 9000
database:
  driver: postgres
  host: db
  port: 5432
"#,
        )
        .unwrap();
        let cfg = load_raw_from_file(f.path()).expect("load");
        assert!(cfg.server.is_some());
        assert!(cfg.database.is_some());
        let s = cfg.server.unwrap();
        assert_eq!(s.host.unwrap(), "0.0.0.0");
        assert_eq!(s.port.unwrap(), 9000);
    }

    #[test]
    fn env_overrides() {
        // Clear any related env vars first to avoid interference
        for k in &[
            "DIDHUB_SERVER_HOST",
            "DIDHUB_SERVER_PORT",
            "DIDHUB_LOG_LEVEL",
            "DIDHUB_LOG_JSON",
            "DIDHUB_UPLOADS_DIRECTORY",
        ] {
            std::env::remove_var(k);
        }

        std::env::set_var("DIDHUB_SERVER_HOST", "10.1.2.3");
        std::env::set_var("DIDHUB_SERVER_PORT", "1234");
        std::env::set_var("DIDHUB_LOG_LEVEL", "debug");
        std::env::set_var("DIDHUB_LOG_JSON", "true");
        std::env::set_var("DIDHUB_UPLOADS_DIRECTORY", "/var/uploads");

        let cfg = load_config::<&Path>(None).expect("load config");
        assert_eq!(cfg.server.host, "10.1.2.3");
        assert_eq!(cfg.server.port, 1234);
        assert_eq!(cfg.logging.level, "debug");
        assert!(cfg.logging.json);
        assert_eq!(cfg.uploads.directory, "/var/uploads");

        // cleanup
        for k in &[
            "DIDHUB_SERVER_HOST",
            "DIDHUB_SERVER_PORT",
            "DIDHUB_LOG_LEVEL",
            "DIDHUB_LOG_JSON",
            "DIDHUB_UPLOADS_DIRECTORY",
        ] {
            std::env::remove_var(k);
        }
    }

    #[test]
    fn csv_split() {
        let s = "https://a.example, https://b.example, , https://c.example";
        let parts = split_csv(s);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], "https://a.example");
        assert_eq!(parts[1], "https://b.example");
        assert_eq!(parts[2], "https://c.example");
    }

    #[test]
    fn db_env_merging() {
        // Clean existing env vars we will use
        for k in &[
            "DIDHUB_DATABASE_DRIVER",
            "DIDHUB_DATABASE_PATH",
            "DIDHUB_DATABASE_HOST",
            "DIDHUB_DATABASE_NAME",
        ] {
            std::env::remove_var(k);
        }

        // Set env vars for DB
        std::env::set_var("DIDHUB_DATABASE_DRIVER", "postgres");
        std::env::set_var("DIDHUB_DATABASE_HOST", "db-host");
        std::env::set_var("DIDHUB_DATABASE_NAME", "didhubdb");

        let cfg = load_config::<&Path>(None).expect("load");
        assert_eq!(cfg.database.driver, "postgres");
        assert_eq!(cfg.database.host.unwrap(), "db-host");
        assert_eq!(cfg.database.database.unwrap(), "didhubdb");

        for k in &[
            "DIDHUB_DATABASE_DRIVER",
            "DIDHUB_DATABASE_PATH",
            "DIDHUB_DATABASE_HOST",
            "DIDHUB_DATABASE_NAME",
        ] {
            std::env::remove_var(k);
        }
    }
}
