use std::env::{self, VarError};
use std::num::ParseIntError;
use std::time::Duration;

use didhub_log_client::{
    AppendRequest, ExportOptions, LogCategory as ConnectionLogCategory, LogClientError,
    LogEntry as ConnectionLogEntry, LogToolClient,
};
use serde::Deserialize;
use serde_json::json;
#[cfg(feature = "mysql")]
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
#[cfg(feature = "postgres")]
use sqlx::postgres::{PgPool, PgPoolOptions};
#[cfg(feature = "sqlite")]
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use thiserror::Error;

const DEFAULT_MAX_CONNECTIONS: u32 = 10;
const DEFAULT_MIN_CONNECTIONS: u32 = 1;
const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 30;
const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 600;
const DEFAULT_TEST_BEFORE_ACQUIRE: bool = true;

/// Basic configuration for creating a SQLx connection pool.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DbConnectionConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout_secs: u64,
    pub idle_timeout_secs: Option<u64>,
    pub test_before_acquire: bool,
}

impl Default for DbConnectionConfig {
    #[inline]
    fn default() -> Self {
        Self {
            url: String::new(),
            max_connections: DEFAULT_MAX_CONNECTIONS,
            min_connections: DEFAULT_MIN_CONNECTIONS,
            connect_timeout_secs: DEFAULT_CONNECT_TIMEOUT_SECS,
            idle_timeout_secs: Some(DEFAULT_IDLE_TIMEOUT_SECS),
            test_before_acquire: DEFAULT_TEST_BEFORE_ACQUIRE,
        }
    }
}

impl DbConnectionConfig {
    /// Creates a new configuration with the provided URL and sane defaults.
    #[inline]
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            ..Self::default()
        }
    }

    /// Loads configuration from environment variables using the supplied prefix.
    ///
    /// Expected variables:
    /// - `{PREFIX}_DATABASE_URL` (required)
    /// - `{PREFIX}_DB_MAX_CONNECTIONS` (optional)
    /// - `{PREFIX}_DB_MIN_CONNECTIONS` (optional)
    /// - `{PREFIX}_DB_CONNECT_TIMEOUT_SECS` (optional)
    /// - `{PREFIX}_DB_IDLE_TIMEOUT_SECS` (optional)
    /// - `{PREFIX}_DB_TEST_BEFORE_ACQUIRE` (optional, bool)
    pub fn from_env(prefix: &str) -> Result<Self, DbConnectionError> {
        let url_var = format!("{}_DATABASE_URL", prefix);
        let url =
            env::var(&url_var).map_err(|_| DbConnectionError::MissingEnvVar(url_var.clone()))?;
        if url.trim().is_empty() {
            return Err(DbConnectionError::EmptyDatabaseUrl);
        }

        let mut config = Self::new(url);

        if let Some(max) = maybe_parse_u32(prefix, "DB_MAX_CONNECTIONS")? {
            config.max_connections = max;
        }
        if let Some(min) = maybe_parse_u32(prefix, "DB_MIN_CONNECTIONS")? {
            config.min_connections = min;
        }
        if let Some(connect_timeout) = maybe_parse_u64(prefix, "DB_CONNECT_TIMEOUT_SECS")? {
            config.connect_timeout_secs = connect_timeout;
        }
        if let Some(idle_timeout) = maybe_parse_u64(prefix, "DB_IDLE_TIMEOUT_SECS")? {
            config.idle_timeout_secs = Some(idle_timeout);
        }
        if let Some(value) = maybe_parse_bool(prefix, "DB_TEST_BEFORE_ACQUIRE")? {
            config.test_before_acquire = value;
        }

        Ok(config)
    }

    #[inline]
    fn connect_timeout(&self) -> Duration {
        Duration::from_secs(self.connect_timeout_secs)
    }

    #[inline]
    fn idle_timeout(&self) -> Option<Duration> {
        self.idle_timeout_secs.map(Duration::from_secs)
    }
}

#[cfg(not(any(feature = "postgres", feature = "mysql", feature = "sqlite")))]
compile_error!(
    "Enable exactly one of the `postgres`, `mysql`, or `sqlite` features for didhub-db-connection."
);

#[cfg(any(
    all(feature = "postgres", feature = "mysql"),
    all(feature = "postgres", feature = "sqlite"),
    all(feature = "mysql", feature = "sqlite"),
))]
compile_error!("Activate only one backend feature (`postgres`, `mysql`, or `sqlite`) for didhub-db-connection.");

#[cfg(feature = "postgres")]
pub type DbPool = PgPool;
#[cfg(feature = "mysql")]
pub type DbPool = MySqlPool;
#[cfg(feature = "sqlite")]
pub type DbPool = SqlitePool;

#[cfg(feature = "postgres")]
type DbPoolOptions = PgPoolOptions;
#[cfg(feature = "mysql")]
type DbPoolOptions = MySqlPoolOptions;
#[cfg(feature = "sqlite")]
type DbPoolOptions = SqlitePoolOptions;

/// Helper for emitting audit events about database connection lifecycle into the shared log collector.
#[derive(Debug, Clone)]
pub struct ConnectionLogger {
    client: LogToolClient,
    source: String,
}

impl ConnectionLogger {
    /// Build a new logger with an explicit source label (e.g. service name).
    pub fn new(client: LogToolClient, source: impl Into<String>) -> Self {
        Self {
            client,
            source: source.into(),
        }
    }

    /// Access the underlying log tool client.
    pub fn client(&self) -> &LogToolClient {
        &self.client
    }

    /// Record a connection attempt audit event.
    pub fn log_attempt(&self, config: &DbConnectionConfig) -> Result<(), LogClientError> {
        self.append_event("db_pool.create_attempt", config_metadata(config))
    }

    /// Record a successful connection audit event.
    pub fn log_success(&self, config: &DbConnectionConfig) -> Result<(), LogClientError> {
        self.append_event("db_pool.create_success", config_metadata(config))
    }

    /// Record a failed connection audit event including error details.
    pub fn log_failure(
        &self,
        config: &DbConnectionConfig,
        error: &DbConnectionError,
    ) -> Result<(), LogClientError> {
        let metadata = config_metadata(config);
        let enriched = json!({
            "config": metadata,
            "error": error.to_string(),
        });
        self.append_event("db_pool.create_failure", enriched)
    }

    /// Return recent audit entries for the connection component, optionally draining them.
    pub fn export_audit_logs(
        &self,
        limit: Option<usize>,
        drain: bool,
    ) -> Result<Vec<ConnectionLogEntry>, LogClientError> {
        let mut options = ExportOptions::default().with_category(ConnectionLogCategory::Audit);
        if let Some(limit) = limit {
            options = options.with_limit(limit);
        }
        if drain {
            options = options.draining(true);
        }
        self.client.export(options)
    }

    fn append_event(
        &self,
        message: &str,
        metadata: serde_json::Value,
    ) -> Result<(), LogClientError> {
        let mut request = AppendRequest::new(ConnectionLogCategory::Audit, message.to_owned());
        if !self.source.is_empty() {
            request = request.with_source(self.source.clone());
        }
        request = request.with_metadata(metadata);
        self.client.append(request).map(|_| ())
    }
}

/// Creates a new backend-specific connection pool using the provided configuration.
#[inline]
pub async fn create_pool(config: &DbConnectionConfig) -> Result<DbPool, DbConnectionError> {
    create_pool_inner(config).await
}

/// Creates a new pool and emits audit events through the supplied logger.
pub async fn create_pool_with_logging(
    config: &DbConnectionConfig,
    logger: &ConnectionLogger,
) -> Result<DbPool, DbConnectionError> {
    logger.log_attempt(config).map_err(DbConnectionError::LogClient)?;

    match create_pool_inner(config).await {
        Ok(pool) => {
            logger.log_success(config).map_err(DbConnectionError::LogClient)?;
            Ok(pool)
        }
        Err(err) => {
            if let Err(log_error) = logger.log_failure(config, &err) {
                return Err(DbConnectionError::LogClientDuringDbError {
                    original: Box::new(err),
                    log_error,
                });
            }
            Err(err)
        }
    }
}

async fn create_pool_inner(config: &DbConnectionConfig) -> Result<DbPool, DbConnectionError> {
    let url = config.url.trim();
    if url.is_empty() {
        return Err(DbConnectionError::EmptyDatabaseUrl);
    }

    // For sqlite, if the URL refers to a file-based database ensure the
    // parent directory and the file exist before attempting to open a pool.
    // This avoids sqlx returning "unable to open database file" when the
    // file or directory is missing.
    #[cfg(feature = "sqlite")]
    ensure_sqlite_db_file_exists(url)?;

    let mut opts = DbPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(config.connect_timeout());

    #[cfg(not(feature = "sqlite"))]
    {
        opts = opts.test_before_acquire(config.test_before_acquire);
    }

    if let Some(idle) = config.idle_timeout() {
        opts = opts.idle_timeout(idle);
    }

    opts.connect(url).await.map_err(Into::into)
}

#[cfg(feature = "sqlite")]
fn ensure_sqlite_db_file_exists(database_url: &str) -> Result<(), DbConnectionError> {
    use std::fs::{create_dir_all, File};
    use std::io;
    use std::path::Path;

    /// Extract the file path from a SQLite connection URL.
    /// Returns None for in-memory databases or empty paths.
    fn extract_path(url: &str) -> Option<&str> {
        // Treat in-memory DSNs as non-file backends.
        let lower = url.as_bytes();
        if lower.windows(8).any(|w| w.eq_ignore_ascii_case(b":memory:"))
            || lower.windows(11).any(|w| w.eq_ignore_ascii_case(b"mode=memory"))
        {
            return None;
        }

        // Strip sqlite scheme variants
        let mut path = url;
        path = path
            .strip_prefix("sqlite://")
            .or_else(|| path.strip_prefix("sqlite:"))
            .unwrap_or(path);
        path = path.strip_prefix("//").unwrap_or(path);
        path = path.strip_prefix("file:").unwrap_or(path);

        // Remove query params if present
        if let Some(idx) = path.find('?') {
            path = &path[..idx];
        }

        let path = path.trim();
        if path.is_empty() {
            return None;
        }

        // On Windows: strip leading slash before drive letter ("/C:/...")
        if path.len() > 2 && path.starts_with('/') && path.as_bytes().get(2) == Some(&b':') {
            Some(&path[1..])
        } else {
            Some(path)
        }
    }

    let Some(clean_path) = extract_path(database_url) else {
        return Ok(());
    };

    let db_path = Path::new(clean_path);
    if let Some(parent) = db_path.parent().filter(|p| !p.as_os_str().is_empty() && !p.exists()) {
        create_dir_all(parent).map_err(|e| {
            DbConnectionError::FileCreation(format!(
                "failed to create parent directory '{}': {e}",
                parent.display()
            ))
        })?;
    }

    if !db_path.exists() {
        File::create(db_path).map_err(|e| {
            let msg = if e.kind() == io::ErrorKind::PermissionDenied {
                format!("permission denied creating '{}': {e}", db_path.display())
            } else {
                format!("failed to create DB file '{}': {e}", db_path.display())
            };
            DbConnectionError::FileCreation(msg)
        })?;
    }

    Ok(())
}

fn config_metadata(config: &DbConnectionConfig) -> serde_json::Value {
    json!({
        "database_url": sanitize_database_url(&config.url),
        "max_connections": config.max_connections,
        "min_connections": config.min_connections,
        "connect_timeout_secs": config.connect_timeout_secs,
        "idle_timeout_secs": config.idle_timeout_secs,
        "test_before_acquire": config.test_before_acquire,
    })
}

fn sanitize_database_url(raw: &str) -> String {
    // Simple regex-free sanitization: find "://user:pass@" or "://user@" patterns
    // and redact the credentials portion.
    let Some(scheme_end) = raw.find("://") else {
        return "<redacted>".to_owned();
    };
    let rest = &raw[scheme_end + 3..];

    // Find the host portion (ends at / or end of string)
    let host_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..host_end];

    // Check for @ which indicates credentials
    if let Some(at_pos) = authority.rfind('@') {
        // There are credentials to redact
        let scheme = &raw[..scheme_end + 3];
        let host_and_rest = &rest[at_pos + 1..];
        format!("{scheme}****:****@{host_and_rest}")
    } else {
        // No credentials, return as-is
        raw.to_owned()
    }
}

fn maybe_parse_u32(prefix: &str, suffix: &str) -> Result<Option<u32>, DbConnectionError> {
    maybe_parse_env(prefix, suffix, str::parse)
}

fn maybe_parse_u64(prefix: &str, suffix: &str) -> Result<Option<u64>, DbConnectionError> {
    maybe_parse_env(prefix, suffix, str::parse)
}

fn maybe_parse_env<T, E>(
    prefix: &str,
    suffix: &str,
    parser: fn(&str) -> Result<T, E>,
) -> Result<Option<T>, DbConnectionError>
where
    E: Into<ParseIntError>,
{
    let var_name = format!("{prefix}_{suffix}");
    match env::var(&var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                parser(trimmed).map(Some).map_err(|e| DbConnectionError::InvalidNumber {
                    var: var_name,
                    source: e.into(),
                })
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name)),
    }
}

fn maybe_parse_bool(prefix: &str, suffix: &str) -> Result<Option<bool>, DbConnectionError> {
    let var_name = format!("{prefix}_{suffix}");
    match env::var(&var_name) {
        Ok(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            match trimmed.as_bytes() {
                b"1" | b"true" | b"TRUE" | b"yes" | b"YES" | b"on" | b"ON" => Ok(Some(true)),
                b"0" | b"false" | b"FALSE" | b"no" | b"NO" | b"off" | b"OFF" => Ok(Some(false)),
                _ => Err(DbConnectionError::InvalidBoolean {
                    var: var_name,
                    value: trimmed.to_owned(),
                }),
            }
        }
        Err(VarError::NotPresent) => Ok(None),
        Err(VarError::NotUnicode(_)) => Err(DbConnectionError::InvalidUnicode(var_name)),
    }
}

/// Errors that can occur while configuring or creating the database pool.
#[derive(Debug, Error)]
pub enum DbConnectionError {
    #[error("environment variable {0} is missing")]
    MissingEnvVar(String),
    #[error("database url cannot be empty")]
    EmptyDatabaseUrl,
    #[error("environment variable {0} contains invalid unicode")]
    InvalidUnicode(String),
    #[error("failed to parse numeric environment variable {var}: {source}")]
    InvalidNumber {
        var: String,
        #[source]
        source: ParseIntError,
    },
    #[error("invalid boolean value '{value}' for {var}")]
    InvalidBoolean { var: String, value: String },
    #[error("log collector error: {0}")]
    LogClient(#[from] LogClientError),
    #[error("log collector error while handling database failure: {log_error}")]
    LogClientDuringDbError {
        #[source]
        original: Box<DbConnectionError>,
        log_error: LogClientError,
    },
    #[error("file/directory creation error: {0}")]
    FileCreation(String),
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
}
