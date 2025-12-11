pub mod config;
pub mod error;
pub mod logger;
pub mod pool;
pub mod utils;
#[cfg(test)]
mod test;

// Re-exports for public API
pub use config::DbConnectionConfig;
pub use error::{DbConnectionError, DbConnectionErrorKind};
pub use logger::ConnectionLogger;
pub use pool::{create_pool, create_pool_with_logging, DbPool};
