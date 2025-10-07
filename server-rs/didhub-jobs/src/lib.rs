use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

/// Core trait for all housekeeping jobs
#[async_trait]
pub trait Job: Send + Sync {
    /// Unique name identifier for the job
    fn name(&self) -> &'static str;

    /// Human-readable description of what the job does
    fn description(&self) -> &'static str {
        self.name()
    }

    /// Execute the job
    async fn run(&self, db: &didhub_db::Db, cancel_token: &CancellationToken)
        -> Result<JobOutcome>;

    /// Execute a dry run of the job (preview what would be done)
    async fn dry_run(
        &self,
        db: &didhub_db::Db,
        cancel_token: &CancellationToken,
    ) -> Result<JobOutcome> {
        // Default implementation just calls run (jobs can override for optimized dry runs)
        self.run(db, cancel_token).await
    }

    /// Whether this job should run periodically
    fn is_periodic(&self) -> bool {
        true
    }

    /// Default cron schedule for periodic execution (if applicable)
    /// Returns a cron expression like "0 2 * * *" (daily at 2am)
    fn default_schedule(&self) -> Option<&str> {
        None
    }

    /// Job category for organization
    fn category(&self) -> JobCategory {
        JobCategory::Maintenance
    }
}

/// Result of a job execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobOutcome {
    pub rows_affected: i64,
    pub message: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

impl JobOutcome {
    pub fn new(rows_affected: i64, message: Option<String>) -> Self {
        Self {
            rows_affected,
            message,
            metadata: None,
        }
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Categories for organizing jobs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum JobCategory {
    Maintenance,
    Cleanup,
    Metrics,
    Integrity,
    Custom,
}

impl std::fmt::Display for JobCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            JobCategory::Maintenance => "maintenance",
            JobCategory::Cleanup => "cleanup",
            JobCategory::Metrics => "metrics",
            JobCategory::Integrity => "integrity",
            JobCategory::Custom => "custom",
        };
        write!(f, "{}", s)
    }
}

/// Job metadata for configuration and scheduling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobMetadata {
    pub name: String,
    pub description: String,
    pub category: JobCategory,
    pub is_periodic: bool,
    pub default_schedule: Option<String>,
    pub enabled_by_default: bool,
}

impl JobMetadata {
    pub fn from_job<J: Job>(job: &J) -> Self {
        Self {
            name: job.name().to_string(),
            description: job.description().to_string(),
            category: job.category(),
            is_periodic: job.is_periodic(),
            default_schedule: job.default_schedule().map(|s| s.to_string()),
            enabled_by_default: true,
        }
    }
}

/// Registry of available jobs with metadata
pub struct JobRegistry {
    jobs: Vec<Box<dyn Job>>,
    metadata: Vec<JobMetadata>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            jobs: Vec::new(),
            metadata: Vec::new(),
        }
    }

    pub fn register<J: Job + 'static>(&mut self, job: J) {
        let metadata = JobMetadata::from_job(&job);
        self.jobs.push(Box::new(job));
        self.metadata.push(metadata);
    }

    pub fn get_job(&self, name: &str) -> Option<&dyn Job> {
        self.jobs
            .iter()
            .find(|j| j.name() == name)
            .map(|j| j.as_ref())
    }

    pub fn list_jobs(&self) -> Vec<&JobMetadata> {
        self.metadata.iter().collect()
    }

    pub fn list_job_names(&self) -> Vec<String> {
        self.metadata.iter().map(|m| m.name.clone()).collect()
    }
}

impl Default for JobRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// Job implementations
pub mod database;
pub mod maintenance;
pub mod uploads;

// Re-export common jobs
pub use database::{BirthdaysDigestJob, OrphansPruneJob, VacuumDbJob};
pub use maintenance::{AuditRetentionJob, ExpiredTokensCleanupJob, MetricsUpdateJob};
pub use uploads::{UploadsBackfillJob, UploadsGcJob, UploadsIntegrityJob};

/// Build a registry with all default jobs
pub fn build_default_registry() -> JobRegistry {
    let mut registry = JobRegistry::new();

    // Maintenance jobs
    registry.register(AuditRetentionJob);
    registry.register(MetricsUpdateJob);
    registry.register(ExpiredTokensCleanupJob);

    // Upload jobs
    registry.register(UploadsGcJob);
    registry.register(UploadsBackfillJob);
    registry.register(UploadsIntegrityJob);

    // Database jobs
    registry.register(BirthdaysDigestJob);
    registry.register(OrphansPruneJob);
    registry.register(VacuumDbJob);

    registry
}
