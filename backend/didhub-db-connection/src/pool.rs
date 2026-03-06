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

#[cfg(feature = "sqlite")]
pub const SQLITE_MEMORY_PATTERNS: [&[u8]; 2] = [b":memory:", b"mode=memory"];

/// Creates a new backend-specific connection pool using the provided configuration.
pub async fn create_pool(config: &DbConnectionConfig) -> Result<DbPool, DbConnectionError> {
    create_pool_inner(config).await
}

/// Creates a new pool and emits audit events through the supplied logger.
pub async fn create_pool_with_logging(
    config: &DbConnectionConfig,
    logger: &ConnectionLogger,
) -> Result<DbPool, DbConnectionError> {
    logger.log_attempt(config);

    match create_pool_inner(config).await {
        Ok(pool) => {
            logger.log_success(config);
            Ok(pool)
        }
        Err(err) => {
            logger.log_failure(config, &err);
            Err(err)
        }
    }
}

async fn create_pool_inner(config: &DbConnectionConfig) -> Result<DbPool, DbConnectionError> {
    let url = config.url.trim();
    if url.is_empty() {
        return Err(DbConnectionError::EmptyDatabaseUrl);
    }

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

    opts.connect(url).await.map_err(DbConnectionError::from)
}

#[cfg(feature = "sqlite")]
fn ensure_sqlite_db_file_exists(url: &str) -> Result<(), DbConnectionError> {
    if !url.starts_with("sqlite://") {
        return Ok(());
    }
    let path_str = url.trim_start_matches("sqlite://");
    if path_str == ":memory:" {
        return Ok(());
    }
    let path = std::path::Path::new(path_str);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(DbConnectionError::io)?;
        }
    }
    if !path.exists() {
        std::fs::File::create(path).map_err(DbConnectionError::io)?;
    }
    Ok(())
}
