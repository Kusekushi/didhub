#![allow(clippy::all)]

#[cfg(not(any(feature = "postgres", feature = "mysql", feature = "sqlite")))]
compile_error!(
    "Enable exactly one of the `postgres`, `mysql`, or `sqlite` features for didhub-db."
);

#[cfg(any(
    all(feature = "postgres", feature = "mysql"),
    all(feature = "postgres", feature = "sqlite"),
    all(feature = "mysql", feature = "sqlite"),
))]
compile_error!(
    "Activate only one backend feature (`postgres`, `mysql`, or `sqlite`) for didhub-db."
);

#[cfg(feature = "postgres")]
pub type DbBackend = sqlx::Postgres;
#[cfg(feature = "mysql")]
pub type DbBackend = sqlx::MySql;
#[cfg(feature = "sqlite")]
pub type DbBackend = sqlx::Sqlite;

pub mod generated;

pub use didhub_db_connection::{create_pool, DbConnectionConfig, DbConnectionError, DbPool};
