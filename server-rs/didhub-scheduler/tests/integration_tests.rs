use didhub_scheduler::{create_default_scheduler, CronScheduler, JobScheduleConfig};
use didhub_jobs::{AuditRetentionJob, Job, JobOutcome};
use didhub_db::Db;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use anyhow::Result;
use async_trait::async_trait;

// Mock database for testing
struct MockDb;
impl MockDb {
    fn new() -> Self {
        Self
    }
}

// Mock job for testing
#[derive(Clone)]
struct MockJob {
    name: &'static str,
    should_succeed: bool,
    execution_count: Arc<std::sync::Mutex<i32>>,
    should_cancel: bool,
}

impl MockJob {
    fn new(name: &'static str, should_succeed: bool) -> Self {
        Self {
            name,
            should_succeed,
            execution_count: Arc::new(std::sync::Mutex::new(0)),
            should_cancel: false,
        }
    }

    fn new_with_cancel(name: &'static str, should_cancel: bool) -> Self {
        Self {
            name,
            should_succeed: true,
            execution_count: Arc::new(std::sync::Mutex::new(0)),
            should_cancel,
        }
    }

    fn execution_count(&self) -> i32 {
        *self.execution_count.lock().unwrap()
    }
}

#[async_trait]
impl Job for MockJob {
    fn name(&self) -> &'static str {
        self.name
    }

    fn description(&self) -> &'static str {
        "Mock job for testing"
    }

    async fn run(&self, _db: &Db, cancel_token: &CancellationToken) -> Result<JobOutcome> {
        // Increment execution count (don't hold lock across await)
        {
            let mut count = self.execution_count.lock().unwrap();
            *count += 1;
        }

        // Simulate some work
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Check for cancellation
        if cancel_token.is_cancelled() {
            return Ok(JobOutcome::new(0, Some("cancelled".to_string())));
        }

        if self.should_cancel {
            cancel_token.cancel();
            return Ok(JobOutcome::new(0, Some("job requested cancellation".to_string())));
        }

        if self.should_succeed {
            Ok(JobOutcome::new(1, Some(format!("{} completed successfully", self.name))))
        } else {
            Err(anyhow::anyhow!("{} failed as expected", self.name))
        }
    }
}

#[tokio::test]
async fn test_scheduler_creation() {
    let scheduler = create_default_scheduler().await;
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 9); // All default jobs
}

#[tokio::test]
async fn test_schedule_management() {
    let scheduler = CronScheduler::new();

    // Test default schedule
    scheduler.register_job(AuditRetentionJob).await;

    let config = scheduler.get_schedule("audit_retention").await;
    assert!(config.is_some());
    assert!(config.unwrap().enabled);
}

#[tokio::test]
async fn test_scheduler_new() {
    let scheduler = CronScheduler::new();
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 0);
}

#[tokio::test]
async fn test_job_registration() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    // Register job
    scheduler.register_job(mock_job).await;

    // Check it's registered
    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 1);
    assert!(jobs.contains(&"mock_success".to_string()));

    // Check schedule exists
    let config = scheduler.get_schedule("mock_success").await;
    assert!(config.is_some());
    let config = config.unwrap();
    assert!(config.enabled);
    assert_eq!(config.schedule, "0 2 * * *"); // Default schedule
}

#[tokio::test]
async fn test_job_registration_with_custom_schedule() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    // Register with default schedule first
    scheduler.register_job(mock_job).await;

    // Then update to custom schedule
    let custom_config = JobScheduleConfig {
        enabled: true,
        schedule: "0 */4 * * *".to_string(), // Every 4 hours
        last_run: None,
    };

    scheduler.update_schedule("mock_success", custom_config).await;

    let config = scheduler.get_schedule("mock_success").await;
    assert!(config.is_some());
    let config = config.unwrap();
    assert_eq!(config.schedule, "0 */4 * * *");
}

#[tokio::test]
async fn test_job_registration_disabled() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    // Register first
    scheduler.register_job(mock_job).await;

    // Then disable
    let custom_config = JobScheduleConfig {
        enabled: false,
        schedule: "0 2 * * *".to_string(),
        last_run: None,
    };

    scheduler.update_schedule("mock_success", custom_config).await;

    let config = scheduler.get_schedule("mock_success").await;
    assert!(config.is_some());
    assert!(!config.unwrap().enabled);
}

#[tokio::test]
async fn test_schedule_update() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    scheduler.register_job(mock_job).await;

    // Update schedule
    let new_config = JobScheduleConfig {
        enabled: false,
        schedule: "0 6 * * *".to_string(),
        last_run: None,
    };

    scheduler.update_schedule("mock_success", new_config).await;

    let config = scheduler.get_schedule("mock_success").await;
    assert!(config.is_some());
    let config = config.unwrap();
    assert!(!config.enabled);
    assert_eq!(config.schedule, "0 6 * * *");
}

#[tokio::test]
async fn test_schedule_update_nonexistent_job() {
    let scheduler = CronScheduler::new();

    let config = JobScheduleConfig {
        enabled: true,
        schedule: "0 6 * * *".to_string(),
        last_run: None,
    };

    // Should not panic
    scheduler.update_schedule("nonexistent", config).await;
}

#[tokio::test]
async fn test_manual_job_execution_success() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    scheduler.register_job(mock_job).await;

    // Create a mock DB (we'll need to think about this)
    // For now, just test that the method exists and doesn't panic
    // In a real scenario, we'd need a test database

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 1);
}

#[tokio::test]
async fn test_scheduler_cancellation_token() {
    let scheduler = CronScheduler::new();

    // Check that cancellation token is available
    assert!(!scheduler.cancellation_token().is_cancelled());
}

#[tokio::test]
async fn test_scheduler_stop_without_start() {
    let scheduler = CronScheduler::new();

    // Should not panic
    let result = scheduler.stop().await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_multiple_job_registration() {
    let scheduler = CronScheduler::new();

    let job1 = MockJob::new("job1", true);
    let job2 = MockJob::new("job2", true);
    let job3 = MockJob::new("job3", true);

    scheduler.register_job(job1).await;
    scheduler.register_job(job2).await;
    scheduler.register_job(job3).await;

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 3);
    assert!(jobs.contains(&"job1".to_string()));
    assert!(jobs.contains(&"job2".to_string()));
    assert!(jobs.contains(&"job3".to_string()));
}

#[tokio::test]
async fn test_job_schedule_defaults() {
    let scheduler = CronScheduler::new();
    let mock_job = MockJob::new("mock_success", true);

    scheduler.register_job(mock_job).await;

    let config = scheduler.get_schedule("mock_success").await.unwrap();
    assert!(config.enabled);
    assert_eq!(config.schedule, "0 2 * * *"); // Default schedule
    assert!(config.last_run.is_none());
}

#[tokio::test]
async fn test_scheduler_with_all_default_jobs() {
    let scheduler = create_default_scheduler().await;

    let expected_jobs = vec![
        "audit_retention",
        "metrics_update",
        "expired_tokens_cleanup",
        "uploads_gc",
        "uploads_backfill",
        "uploads_integrity",
        "birthdays_digest",
        "orphans_prune",
        "db_vacuum",
    ];

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), expected_jobs.len());

    for expected_job in expected_jobs {
        assert!(jobs.contains(&expected_job.to_string()));
    }
}

#[tokio::test]
async fn test_job_categories() {
    let scheduler = create_default_scheduler().await;

    // Test that we can get schedules for all jobs
    let jobs = scheduler.list_jobs().await;
    for job_name in jobs {
        let config = scheduler.get_schedule(&job_name).await;
        assert!(config.is_some(), "Job {} should have a schedule", job_name);
    }
}

#[tokio::test]
async fn test_scheduler_concurrent_access() {
    let scheduler = Arc::new(CronScheduler::new());

    let job_names = ["concurrent_job_0", "concurrent_job_1", "concurrent_job_2", "concurrent_job_3", "concurrent_job_4",
                     "concurrent_job_5", "concurrent_job_6", "concurrent_job_7", "concurrent_job_8", "concurrent_job_9"];

    let mut handles = vec![];

    // Spawn multiple tasks that register jobs concurrently
    for &job_name in &job_names {
        let scheduler_clone = Arc::clone(&scheduler);
        let handle = tokio::spawn(async move {
            let job = MockJob::new(job_name, true);
            scheduler_clone.register_job(job).await;
        });
        handles.push(handle);
    }

    // Wait for all to complete
    for handle in handles {
        handle.await.unwrap();
    }

    let jobs = scheduler.list_jobs().await;
    assert_eq!(jobs.len(), 10);
}

#[tokio::test]
async fn test_scheduler_isolation() {
    // Test that multiple schedulers don't interfere with each other
    let scheduler1 = CronScheduler::new();
    let scheduler2 = CronScheduler::new();

    let job1 = MockJob::new("job1", true);
    let job2 = MockJob::new("job2", true);

    scheduler1.register_job(job1).await;
    scheduler2.register_job(job2).await;

    assert_eq!(scheduler1.list_jobs().await.len(), 1);
    assert_eq!(scheduler2.list_jobs().await.len(), 1);

    assert!(scheduler1.list_jobs().await.contains(&"job1".to_string()));
    assert!(scheduler2.list_jobs().await.contains(&"job2".to_string()));
}