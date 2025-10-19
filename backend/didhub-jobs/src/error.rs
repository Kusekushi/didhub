//! Job execution errors.

use thiserror::Error;

/// Errors that may occur during job execution.
#[derive(Debug, Error)]
pub enum JobError {
    #[error("invalid payload: {0}")]
    InvalidPayload(String),

    #[error("backup failed: {0}")]
    BackupFailed(String),

    #[error("restore failed: {0}")]
    RestoreFailed(String),

    #[error("update failed: {0}")]
    UpdateFailed(String),

    #[error("configuration error: {0}")]
    ConfigError(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
