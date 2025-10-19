//! Core types for the job queue system.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// Minimal representation of a job request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRequest {
    pub job_type: String,
    pub payload: Value,
}

impl JobRequest {
    #[inline]
    pub fn new(job_type: impl Into<String>, payload: Value) -> Self {
        Self {
            job_type: job_type.into(),
            payload,
        }
    }
}

/// Result returned after a job has been enqueued.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnqueueResult {
    pub job_id: Uuid,
}

/// Status of a job run.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

impl JobStatus {
    /// Returns true if this status represents a terminal state.
    #[inline]
    pub const fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed)
    }
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
        })
    }
}

/// A record of a job execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRun {
    pub id: Uuid,
    pub job_name: String,
    pub status: JobStatus,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error_message: Option<String>,
    pub payload: Option<Value>,
}

impl JobRun {
    /// Create a new pending job run.
    #[inline]
    pub fn new(job_name: impl Into<String>, payload: Option<Value>) -> Self {
        Self {
            id: Uuid::new_v4(),
            job_name: job_name.into(),
            status: JobStatus::Pending,
            started_at: chrono::Utc::now(),
            finished_at: None,
            error_message: None,
            payload,
        }
    }

    /// Create a new pending job run with a specific ID.
    #[inline]
    pub fn with_id(id: Uuid, job_name: impl Into<String>, payload: Option<Value>) -> Self {
        Self {
            id,
            job_name: job_name.into(),
            status: JobStatus::Pending,
            started_at: chrono::Utc::now(),
            finished_at: None,
            error_message: None,
            payload,
        }
    }

    /// Mark the job as running.
    #[inline]
    pub fn start(&mut self) {
        self.status = JobStatus::Running;
    }

    /// Mark the job as completed.
    #[inline]
    pub fn complete(&mut self) {
        self.status = JobStatus::Completed;
        self.finished_at = Some(chrono::Utc::now());
    }

    /// Mark the job as failed with an error message.
    #[inline]
    pub fn fail(&mut self, message: impl Into<String>) {
        self.status = JobStatus::Failed;
        self.finished_at = Some(chrono::Utc::now());
        self.error_message = Some(message.into());
    }
}
