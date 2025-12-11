pub mod config;
pub mod error;
pub mod logger;
pub mod pool;
#[cfg(test)]
mod test;
pub mod utils;

// Re-exports for public API
pub use config::DbConnectionConfig;
pub use error::{DbConnectionError, DbConnectionErrorKind};
pub use logger::ConnectionLogger;
pub use pool::{create_pool, create_pool_with_logging, DbPool};
