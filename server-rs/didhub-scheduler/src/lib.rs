use anyhow::Result;
use didhub_db::{common::CommonOperations, Db};
use didhub_jobs::Job;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use tokio_cron_scheduler::{Job as CronJob, JobScheduler};
use tokio_util::sync::CancellationToken;
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

    /// List all registered jobs with metadata
    pub async fn list_jobs_with_metadata(&self) -> Vec<(String, String, bool, Option<String>)> {
        let jobs = self.jobs.read().await;
        jobs.values()
            .map(|sj| {
                let last_run = sj.config.last_run.map(|dt| dt.to_rfc3339());
                (
                    sj.job.name().to_string(),
                    sj.job.description().to_string(),
                    sj.config.enabled,
                    last_run,
                )
            })
            .collect()
    }

    /// Start the cron scheduler with all enabled jobs
    pub async fn start(&self, db: Db) -> Result<()> {
        let scheduler = JobScheduler::new().await?;

        // Collect enabled jobs info
        let enabled_jobs: Vec<(String, String)> = {
            let jobs = self.jobs.read().await;
            jobs.iter()
                .filter(|(_, sj)| sj.config.enabled)
                .map(|(name, sj)| (name.clone(), sj.config.schedule.clone()))
                .collect()
        };

        for (job_name, schedule) in enabled_jobs {
            let db_clone = db.clone();
            let job_name_clone = job_name.clone();
            let cancel_token = self.cancellation_token.clone();
            let scheduler_clone_outer = self.clone();

            let cron_job = CronJob::new(schedule.as_str(), move |_uuid, _lock| {
                let db = db_clone.clone();
                let name = job_name_clone.clone();
                let token = cancel_token.clone();
                let scheduler_clone = scheduler_clone_outer.clone();
                tokio::spawn(async move {
                    // Check if scheduler is shutting down
                    if token.is_cancelled() {
                        debug!(job_name = %name, "skipping job execution - scheduler shutting down");
                        return;
                    }

                    debug!(job_name = %name, "cron job triggered");

                    let run_record = db.start_housekeeping_run(&name).await;
                    let run_id = match run_record {
                        Ok(ref run) => Some(run.id.to_string()),
                        Err(ref err) => {
                            error!(job_name = %name, error = %err, "failed to record scheduled housekeeping run start");
                            None
                        }
                    };

                    if let Err(err) = scheduler_clone
                        .run_job_by_name_with_run_and_token(&db, &name, run_id, token.clone())
                        .await
                    {
                        error!(job_name = %name, error = %err, "scheduled job execution failed");
                    }
                });
            })?;

            scheduler.add(cron_job).await?;
            info!(job_name = %job_name, schedule = %schedule, "scheduled cron job");
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

    async fn run_job_by_name_with_run_internal(
        &self,
        db: &Db,
        name: &str,
        existing_run_id: Option<String>,
        cancel_token: Option<CancellationToken>,
    ) -> Result<didhub_jobs::JobOutcome> {
        let job_arc = {
            let jobs = self.jobs.read().await;
            if let Some(scheduled_job) = jobs.get(name) {
                scheduled_job.job.clone()
            } else {
                warn!(job_name = %name, "job not found in scheduler");
                anyhow::bail!("job '{}' not found", name);
            }
        };

        let mut run_id = existing_run_id;
        if run_id.is_none() {
            match db.start_housekeeping_run(name).await {
                Ok(run) => run_id = Some(run.id.to_string()),
                Err(err) => {
                    error!(job_name = %name, error = %err, "failed to record housekeeping run start");
                }
            }
        }

        let start = Instant::now();
        info!(job_name = %name, "starting job execution");

        let token = cancel_token.unwrap_or_else(CancellationToken::new);

        match job_arc.run(db, &token).await {
            Ok(outcome) => {
                let duration = start.elapsed();
                info!(
                    job_name = %name,
                    rows_affected = %outcome.rows_affected,
                    message = ?outcome.message,
                    duration_ms = %duration.as_millis(),
                    "job completed successfully"
                );

                if let Some(run_id) = run_id {
                    if let Err(err) = db
                        .finish_housekeeping_run(
                            run_id,
                            true,
                            outcome.message.as_deref(),
                            Some(outcome.rows_affected),
                        )
                        .await
                    {
                        error!(job_name = %name, error = %err, "failed to finalize housekeeping run");
                    }
                }

                {
                    let mut jobs = self.jobs.write().await;
                    if let Some(sj) = jobs.get_mut(name) {
                        sj.config.last_run = Some(chrono::Utc::now());
                    }
                }

                Ok(outcome)
            }
            Err(e) => {
                let duration = start.elapsed();
                error!(
                    job_name = %name,
                    error = %e,
                    duration_ms = %duration.as_millis(),
                    "job failed"
                );

                if let Some(run_id) = run_id {
                    let err_message = e.to_string();
                    if let Err(err) = db
                        .finish_housekeeping_run(run_id, false, Some(err_message.as_str()), None)
                        .await
                    {
                        error!(job_name = %name, error = %err, "failed to finalize failed housekeeping run");
                    }
                }

                Err(e)
            }
        }
    }

    /// Run a job by name immediately, creating a housekeeping run entry automatically.
    pub async fn run_job_by_name(&self, db: &Db, name: &str) -> Result<didhub_jobs::JobOutcome> {
        self.run_job_by_name_with_run_internal(db, name, None, None)
            .await
    }

    /// Run a job by name using an existing housekeeping run entry if provided.
    pub async fn run_job_by_name_with_run(
        &self,
        db: &Db,
        name: &str,
        existing_run_id: Option<String>,
    ) -> Result<didhub_jobs::JobOutcome> {
        self.run_job_by_name_with_run_internal(db, name, existing_run_id, None)
            .await
    }

    /// Run a job by name using an existing run entry and an explicit cancellation token.
    pub async fn run_job_by_name_with_run_and_token(
        &self,
        db: &Db,
        name: &str,
        existing_run_id: Option<String>,
        cancel_token: CancellationToken,
    ) -> Result<didhub_jobs::JobOutcome> {
        self.run_job_by_name_with_run_internal(db, name, existing_run_id, Some(cancel_token))
            .await
    }

    /// Run a dry run of a job by name immediately
    pub async fn dry_run_job_by_name(
        &self,
        db: &Db,
        name: &str,
    ) -> Result<didhub_jobs::JobOutcome> {
        let jobs = self.jobs.read().await;
        if let Some(scheduled_job) = jobs.get(name) {
            let start = Instant::now();
            info!(job_name = %name, "starting manual dry run job execution");

            // Use a new token for manual runs to avoid cancellation
            let manual_token = CancellationToken::new();

            match scheduled_job.job.dry_run(db, &manual_token).await {
                Ok(outcome) => {
                    let duration = start.elapsed();
                    info!(
                        job_name = %name,
                        rows_affected = %outcome.rows_affected,
                        message = ?outcome.message,
                        duration_ms = %duration.as_millis(),
                        "manual dry run job completed successfully"
                    );

                    // Do not update last_run for dry runs
                    Ok(outcome)
                }
                Err(e) => {
                    let duration = start.elapsed();
                    error!(
                        job_name = %name,
                        error = %e,
                        duration_ms = %duration.as_millis(),
                        "manual dry run job failed"
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
    scheduler
        .register_job(didhub_jobs::ExpiredTokensCleanupJob)
        .await;
    scheduler.register_job(didhub_jobs::UploadsGcJob).await;
    scheduler
        .register_job(didhub_jobs::UploadsBackfillJob)
        .await;
    scheduler
        .register_job(didhub_jobs::UploadsIntegrityJob)
        .await;
    scheduler
        .register_job(didhub_jobs::BirthdaysDigestJob)
        .await;
    scheduler.register_job(didhub_jobs::OrphansPruneJob).await;
    scheduler.register_job(didhub_jobs::VacuumDbJob).await;

    scheduler
}
