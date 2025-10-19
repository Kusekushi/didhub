//! Error types for the job queue system.

use thiserror::Error;
use uuid::Uuid;

/// Errors that may occur while interacting with the job queue.
#[derive(Debug, Error)]
pub enum JobQueueError {
    #[error("job queue backend is unavailable")]
    Unavailable,

    #[error("failed to enqueue job: {0}")]
    Backend(String),

    #[error("job not found: {0}")]
    NotFound(Uuid),

    #[error("job execution failed: {0}")]
    ExecutionFailed(String),
}
