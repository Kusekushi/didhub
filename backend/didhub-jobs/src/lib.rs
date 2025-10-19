//! Concrete job implementations for the DIDHub backend.
//!
//! This crate provides implementations of the [`JobExecutor`](didhub_job_queue::JobExecutor)
//! trait for the various job types used in the backend.
//!
//! # Job Types
//!
//! - `backup.create` - Create a database backup
//! - `backup.restore` - Restore from a database backup
//! - `update.execute` - Execute a system update
//! - `config.reload` - Handle configuration reload events
//!
//! # Usage
//!
//! ```rust,no_run
//! use didhub_job_queue::JobQueueClient;
//! use didhub_jobs::register_all_executors;
//!
//! #[tokio::main]
//! async fn main() {
//!     let client = JobQueueClient::new();
//!     register_all_executors(&client).await;
//! }
//! ```

mod backup;
mod config;
mod error;
mod update;

pub use backup::{BackupCreateExecutor, BackupRestoreExecutor};
pub use config::ConfigReloadExecutor;
pub use error::JobError;
pub use update::UpdateExecuteExecutor;

use didhub_job_queue::JobQueueClient;

/// Register all available job executors with the job queue client.
pub async fn register_all_executors(client: &JobQueueClient) {
    client.register_executor(BackupCreateExecutor::new()).await;
    client.register_executor(BackupRestoreExecutor::new()).await;
    client.register_executor(UpdateExecuteExecutor::new()).await;
    client.register_executor(ConfigReloadExecutor::new()).await;
}

/// Job type constants for type-safe job references.
pub mod job_types {
    pub const BACKUP_CREATE: &str = "backup.create";
    pub const BACKUP_RESTORE: &str = "backup.restore";
    pub const UPDATE_EXECUTE: &str = "update.execute";
    pub const CONFIG_RELOAD: &str = "config.reload";
}
