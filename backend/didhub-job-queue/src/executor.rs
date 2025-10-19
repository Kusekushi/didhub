//! Job executor trait for implementing job handlers.

use async_trait::async_trait;
use serde_json::Value;

use crate::error::JobQueueError;

/// Trait for implementing job executors.
///
/// Job executors handle the actual execution of jobs. Each job type should have
/// a corresponding executor implementation.
#[async_trait]
pub trait JobExecutor: Send + Sync {
    /// Returns the job type this executor handles.
    fn job_type(&self) -> &str;

    /// Execute the job with the given payload.
    ///
    /// Returns `Ok(())` on success, or an error describing the failure.
    async fn execute(&self, payload: Value) -> Result<(), JobQueueError>;
}

/// A no-op executor that immediately completes jobs.
///
/// This is useful for testing or as a placeholder when the actual job
/// implementation isn't ready yet.
#[derive(Debug, Default, Clone)]
pub struct NoOpExecutor {
    job_type: String,
}

impl NoOpExecutor {
    pub fn new(job_type: impl Into<String>) -> Self {
        Self {
            job_type: job_type.into(),
        }
    }
}

#[async_trait]
impl JobExecutor for NoOpExecutor {
    fn job_type(&self) -> &str {
        &self.job_type
    }

    async fn execute(&self, _payload: Value) -> Result<(), JobQueueError> {
        // No-op: job completes immediately
        Ok(())
    }
}
