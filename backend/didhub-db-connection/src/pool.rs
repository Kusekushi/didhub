#[cfg(feature = "mysql")]
use sqlx::mysql::{MySqlPool, MySqlPoolOptions};
#[cfg(feature = "postgres")]
use sqlx::postgres::{PgPool, PgPoolOptions};
#[cfg(feature = "sqlite")]
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

use crate::config::DbConnectionConfig;
use crate::error::DbConnectionError;
use crate::logger::ConnectionLogger;

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

/// Creates a new backend-specific connection pool using the provided configuration.
pub async fn create_pool(config: &DbConnectionConfig) -> Result<DbPool, DbConnectionError> {
    create_pool_inner(config).await
}

/// Creates a new pool and emits audit events through the supplied logger.
///
/// This function provides comprehensive logging of connection attempts, successes, and failures.
/// It's optimized to minimize allocations during normal operations.
pub async fn create_pool_with_logging(
    config: &DbConnectionConfig,
    logger: &ConnectionLogger,
) -> Result<DbPool, DbConnectionError> {
    logger
        .log_attempt(config)
        .map_err(DbConnectionError::LogClient)?;

    match create_pool_inner(config).await {
        Ok(pool) => {
            logger
                .log_success(config)
                .map_err(DbConnectionError::LogClient)?;
            Ok(pool)
        }
        Err(err) => {
            if let Err(log_error) = logger.log_failure(config, &err) {
                return Err(DbConnectionError::LogClientDuringDbError {
                    original: err.into(),
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
        // Treat in-memory DSNs as non-file backends using precompiled patterns.
        let url_bytes = url.as_bytes();
        for &pattern in SQLITE_MEMORY_PATTERNS {
            if url_bytes
                .windows(pattern.len())
                .any(|w| w.eq_ignore_ascii_case(pattern))
            {
                return None;
            }
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
    if let Some(parent) = db_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty() && !p.exists())
    {
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

#[cfg(feature = "sqlite")]
// SQLite memory database patterns for efficient checking
pub const SQLITE_MEMORY_PATTERNS: &[&[u8]] = &[b":memory:", b"mode=memory"];
