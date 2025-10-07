use anyhow::Result;
use didhub_db::Db;
use didhub_jobs::Job;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tokio_cron_scheduler::{Job as CronJob, JobScheduler};
use tracing::{debug, error, info, warn};

/// Configuration for job scheduling
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobScheduleConfig {
    pub enabled: bool,
    pub schedule: String,
    pub last_run: Option<chrono::DateTime<chrono::Utc>>,
}

impl Default for JobScheduleConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            schedule: "0 2 * * *".to_string(), // Daily at 2 AM default
            last_run: None,
        }
    }
}

/// A scheduled job with its configuration
#[derive(Clone)]
pub struct ScheduledJob {
    pub job: Arc<dyn Job + Send + Sync>,
    pub config: JobScheduleConfig,
}

/// Cron-based scheduler that manages jobs directly
#[derive(Clone)]
pub struct CronScheduler {
    jobs: Arc<RwLock<HashMap<String, ScheduledJob>>>,
    scheduler: Arc<RwLock<Option<JobScheduler>>>,
    cancellation_token: CancellationToken,
}

impl CronScheduler {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            scheduler: Arc::new(RwLock::new(None)),
            cancellation_token: CancellationToken::new(),
        }
    }

    /// Register a job with its default schedule
    pub async fn register_job<J: Job + Send + Sync + 'static>(&self, job: J) {
        let name = job.name().to_string();
        let config = JobScheduleConfig {
            enabled: job.is_periodic(),
            schedule: job.default_schedule().unwrap_or("@daily").to_string(),
            last_run: None,
        };

        let scheduled_job = ScheduledJob {
            job: Arc::new(job),
            config,
        };

        let mut jobs = self.jobs.write().await;
        jobs.insert(name, scheduled_job);
    }

    /// Update a job's schedule configuration
    pub async fn update_schedule(&self, job_name: &str, config: JobScheduleConfig) {
        let mut jobs = self.jobs.write().await;
        if let Some(scheduled_job) = jobs.get_mut(job_name) {
            scheduled_job.config = config;
        }
    }

    /// Get a job's current configuration
    pub async fn get_schedule(&self, job_name: &str) -> Option<JobScheduleConfig> {
        let jobs = self.jobs.read().await;
        jobs.get(job_name).map(|sj| sj.config.clone())
    }

    /// List all registered job names
    pub async fn list_jobs(&self) -> Vec<String> {
        let jobs = self.jobs.read().await;
        jobs.keys().cloned().collect()
    }

    /// Start the cron scheduler with all enabled jobs
    pub async fn start(&self, db: Db) -> Result<()> {
        let scheduler = JobScheduler::new().await?;

        let jobs = self.jobs.read().await;
        for (job_name, scheduled_job) in jobs.iter() {
            if scheduled_job.config.enabled {
                let job_arc = scheduled_job.job.clone();
                let db_clone = db.clone();
                let job_name_clone = job_name.clone();
                let cancel_token = self.cancellation_token.clone();

                let cron_job = CronJob::new(scheduled_job.config.schedule.as_str(), move |_uuid, _lock| {
                    let job = job_arc.clone();
                    let db = db_clone.clone();
                    let name = job_name_clone.clone();
                    let token = cancel_token.clone();

                    tokio::spawn(async move {
                        // Check if scheduler is shutting down
                        if token.is_cancelled() {
                            debug!(job_name = %name, "skipping job execution - scheduler shutting down");
                            return;
                        }

                        debug!(job_name = %name, "cron job triggered");

                        let start = Instant::now();
                        info!(job_name = %name, "starting scheduled job execution");

                        match job.run(&db, &token).await {
                            Ok(outcome) => {
                                let duration = start.elapsed();
                                info!(
                                    job_name = %name,
                                    rows_affected = %outcome.rows_affected,
                                    message = ?outcome.message,
                                    duration_ms = %duration.as_millis(),
                                    "scheduled job completed successfully"
                                );
                            }
                            Err(e) => {
                                let duration = start.elapsed();
                                error!(
                                    job_name = %name,
                                    error = %e,
                                    duration_ms = %duration.as_millis(),
                                    "scheduled job failed"
                                );
                            }
                        }
                    });
                })?;

                scheduler.add(cron_job).await?;
                info!(job_name = %job_name, schedule = %scheduled_job.config.schedule, "scheduled cron job");
            }
        }

        scheduler.start().await?;

        // Store the scheduler
        *self.scheduler.write().await = Some(scheduler);

        info!("cron scheduler started");
        Ok(())
    }

    /// Stop the scheduler and cancel all running jobs
    pub async fn stop(&self) -> Result<()> {
        info!("stopping cron scheduler");

        // Cancel the token to signal cancellation
        self.cancellation_token.cancel();

        // Shutdown the scheduler
        let mut scheduler_guard = self.scheduler.write().await;
        if let Some(sched) = scheduler_guard.as_mut() {
            sched.shutdown().await?;
        }
        *scheduler_guard = None;

        info!("cron scheduler stopped");
        Ok(())
    }

    /// Get a cancellation token for coordinating shutdown
    pub fn cancellation_token(&self) -> CancellationToken {
        self.cancellation_token.clone()
    }

    /// Run a job by name immediately
    pub async fn run_job_by_name(&self, db: &Db, name: &str) -> Result<didhub_jobs::JobOutcome> {
        let jobs = self.jobs.read().await;
        if let Some(scheduled_job) = jobs.get(name) {
            let start = Instant::now();
            info!(job_name = %name, "starting manual job execution");

            match scheduled_job.job.run(db, &self.cancellation_token).await {
                Ok(outcome) => {
                    let duration = start.elapsed();
                    info!(
                        job_name = %name,
                        rows_affected = %outcome.rows_affected,
                        message = ?outcome.message,
                        duration_ms = %duration.as_millis(),
                        "manual job completed successfully"
                    );
                    Ok(outcome)
                }
                Err(e) => {
                    let duration = start.elapsed();
                    error!(
                        job_name = %name,
                        error = %e,
                        duration_ms = %duration.as_millis(),
                        "manual job failed"
                    );
                    Err(e)
                }
            }
        } else {
            warn!(job_name = %name, "job not found in scheduler");
            anyhow::bail!("job '{}' not found", name);
        }
    }
}

impl Default for CronScheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// Create a default cron scheduler with all built-in jobs
pub async fn create_default_scheduler() -> CronScheduler {
    let scheduler = CronScheduler::new();

    // Register all default jobs
    scheduler.register_job(didhub_jobs::AuditRetentionJob).await;
    scheduler.register_job(didhub_jobs::MetricsUpdateJob).await;
    scheduler.register_job(didhub_jobs::ExpiredTokensCleanupJob).await;
    scheduler.register_job(didhub_jobs::UploadsGcJob).await;
    scheduler.register_job(didhub_jobs::UploadsBackfillJob).await;
    scheduler.register_job(didhub_jobs::UploadsIntegrityJob).await;
    scheduler.register_job(didhub_jobs::BirthdaysDigestJob).await;
    scheduler.register_job(didhub_jobs::OrphansPruneJob).await;
    scheduler.register_job(didhub_jobs::VacuumDbJob).await;

    scheduler
}
