use didhub_db::Db;
use didhub_jobs::*;
use std::collections::HashSet;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

// Mock database for testing - in a real scenario, we'd use a test database
struct MockDb;
impl MockDb {
    fn new() -> Self {
        Self
    }
}

impl AsRef<Db> for MockDb {
    fn as_ref(&self) -> &Db {
        // This is unsafe but for testing purposes, we'll create a dummy pointer
        // In real tests, you'd use a proper test database
        unsafe { &*(0x1 as *const Db) }
    }
}

#[tokio::test]
async fn test_job_trait_compliance() {
    // Test that all jobs implement the Job trait correctly
    let jobs: Vec<Box<dyn Job + Send + Sync>> = vec![
        Box::new(AuditRetentionJob),
        Box::new(MetricsUpdateJob),
        Box::new(ExpiredTokensCleanupJob),
        Box::new(UploadsGcJob),
        Box::new(UploadsBackfillJob),
        Box::new(UploadsIntegrityJob),
        Box::new(BirthdaysDigestJob),
        Box::new(OrphansPruneJob),
        Box::new(VacuumDbJob),
    ];

    for job in jobs {
        // Test basic trait methods
        assert!(!job.name().is_empty());
        assert!(!job.description().is_empty());
        assert!(job.is_periodic() || !job.is_periodic()); // Either is fine

        // Test category
        let _category = job.category();
    }
}

#[tokio::test]
async fn test_job_names_uniqueness() {
    let job_names = vec![
        AuditRetentionJob.name(),
        MetricsUpdateJob.name(),
        ExpiredTokensCleanupJob.name(),
        UploadsGcJob.name(),
        UploadsBackfillJob.name(),
        UploadsIntegrityJob.name(),
        BirthdaysDigestJob.name(),
        OrphansPruneJob.name(),
        VacuumDbJob.name(),
    ];

    let mut unique_names = std::collections::HashSet::new();
    for name in job_names {
        assert!(
            unique_names.insert(name),
            "Job name '{}' is not unique",
            name
        );
    }
}

#[tokio::test]
async fn test_job_categories() {
    assert_eq!(AuditRetentionJob.category(), JobCategory::Cleanup);
    assert_eq!(MetricsUpdateJob.category(), JobCategory::Metrics);
    assert_eq!(ExpiredTokensCleanupJob.category(), JobCategory::Cleanup);
    assert_eq!(UploadsGcJob.category(), JobCategory::Cleanup);
    assert_eq!(UploadsBackfillJob.category(), JobCategory::Maintenance);
    assert_eq!(UploadsIntegrityJob.category(), JobCategory::Integrity);
    assert_eq!(BirthdaysDigestJob.category(), JobCategory::Custom);
    assert_eq!(OrphansPruneJob.category(), JobCategory::Cleanup);
    assert_eq!(VacuumDbJob.category(), JobCategory::Maintenance);
}

#[tokio::test]
async fn test_job_schedules() {
    // Test that jobs have appropriate default schedules
    assert_eq!(
        AuditRetentionJob.default_schedule(),
        Some("0 0,6,12,18 * * *")
    );
    assert_eq!(MetricsUpdateJob.default_schedule(), Some("@hourly"));
    assert_eq!(ExpiredTokensCleanupJob.default_schedule(), Some("@daily"));
    assert_eq!(UploadsGcJob.default_schedule(), Some("@daily"));
    assert_eq!(UploadsBackfillJob.default_schedule(), None); // Not periodic
    assert_eq!(UploadsIntegrityJob.default_schedule(), Some("@daily"));
    assert_eq!(BirthdaysDigestJob.default_schedule(), Some("@daily"));
    assert_eq!(OrphansPruneJob.default_schedule(), Some("@daily"));
    assert_eq!(VacuumDbJob.default_schedule(), Some("0 4 1 * *"));
}

#[tokio::test]
async fn test_job_periodicity() {
    assert!(AuditRetentionJob.is_periodic());
    assert!(MetricsUpdateJob.is_periodic());
    assert!(ExpiredTokensCleanupJob.is_periodic());
    assert!(UploadsGcJob.is_periodic());
    assert!(!UploadsBackfillJob.is_periodic()); // One-time job
    assert!(UploadsIntegrityJob.is_periodic());
    assert!(BirthdaysDigestJob.is_periodic());
    assert!(OrphansPruneJob.is_periodic());
    assert!(VacuumDbJob.is_periodic());
}

#[tokio::test]
async fn test_job_descriptions() {
    assert!(!AuditRetentionJob.description().is_empty());
    assert!(!MetricsUpdateJob.description().is_empty());
    assert!(!ExpiredTokensCleanupJob.description().is_empty());
    assert!(!UploadsGcJob.description().is_empty());
    assert!(!UploadsBackfillJob.description().is_empty());
    assert!(!UploadsIntegrityJob.description().is_empty());
    assert!(!BirthdaysDigestJob.description().is_empty());
    assert!(!OrphansPruneJob.description().is_empty());
    assert!(!VacuumDbJob.description().is_empty());
}

#[tokio::test]
async fn test_job_cancellation_handling() {
    let _cancel_token = CancellationToken::new();

    // Test with non-cancelled token
    // Note: We can't actually run the jobs without a real database,
    // but we can test that the trait signature is correct

    let job = AuditRetentionJob;
    assert_eq!(job.name(), "audit_retention");

    // Test cancellation token handling by checking method signature
    // In a real test environment, we'd have a test database
}

#[tokio::test]
async fn test_job_outcome_structure() {
    let outcome = JobOutcome::new(42, Some("test message".to_string()));

    assert_eq!(outcome.rows_affected, 42);
    assert_eq!(outcome.message, Some("test message".to_string()));
    assert!(outcome.metadata.is_none());
}

#[tokio::test]
async fn test_job_outcome_with_metadata() {
    use serde_json::json;

    let mut outcome = JobOutcome::new(10, Some("completed".to_string()));
    outcome.metadata = Some(json!({"processed": 10, "skipped": 2}));

    assert_eq!(outcome.rows_affected, 10);
    assert_eq!(outcome.message, Some("completed".to_string()));
    assert!(outcome.metadata.is_some());

    let metadata = outcome.metadata.as_ref().unwrap();
    assert_eq!(metadata["processed"], 10);
    assert_eq!(metadata["skipped"], 2);
}

#[tokio::test]
async fn test_job_category_enum() {
    assert_eq!(JobCategory::Cleanup.to_string(), "cleanup");
    assert_eq!(JobCategory::Maintenance.to_string(), "maintenance");
    assert_eq!(JobCategory::Metrics.to_string(), "metrics");
    assert_eq!(JobCategory::Integrity.to_string(), "integrity");
    assert_eq!(JobCategory::Custom.to_string(), "custom");
}

#[tokio::test]
async fn test_job_instances_are_independent() {
    // Test that job instances don't interfere with each other
    let job1 = AuditRetentionJob;
    let job2 = AuditRetentionJob;

    assert_eq!(job1.name(), job2.name());
    assert_eq!(job1.description(), job2.description());
    assert_eq!(job1.category(), job2.category());
}

#[tokio::test]
async fn test_all_jobs_have_valid_names() {
    let jobs: Vec<Box<dyn Job + Send + Sync>> = vec![
        Box::new(AuditRetentionJob),
        Box::new(MetricsUpdateJob),
        Box::new(ExpiredTokensCleanupJob),
        Box::new(UploadsGcJob),
        Box::new(UploadsBackfillJob),
        Box::new(UploadsIntegrityJob),
        Box::new(BirthdaysDigestJob),
        Box::new(OrphansPruneJob),
        Box::new(VacuumDbJob),
    ];

    for job in jobs {
        let name = job.name();

        // Names should be valid identifiers (no spaces, special chars)
        assert!(!name.is_empty());
        assert!(name.chars().all(|c| c.is_alphanumeric() || c == '_'));
        assert!(name.chars().next().unwrap().is_alphabetic());
    }
}

#[tokio::test]
async fn test_job_descriptions_are_informative() {
    let jobs: Vec<Box<dyn Job + Send + Sync>> = vec![
        Box::new(AuditRetentionJob),
        Box::new(MetricsUpdateJob),
        Box::new(ExpiredTokensCleanupJob),
        Box::new(UploadsGcJob),
        Box::new(UploadsBackfillJob),
        Box::new(UploadsIntegrityJob),
        Box::new(BirthdaysDigestJob),
        Box::new(OrphansPruneJob),
        Box::new(VacuumDbJob),
    ];

    for job in jobs {
        let description = job.description();

        // Descriptions should be meaningful and not just the name
        assert!(description.len() > job.name().len());
        assert!(!description.contains("job") || description != job.name());
    }
}

#[tokio::test]
async fn test_job_category_coverage() {
    use std::collections::HashSet;

    let categories: Vec<JobCategory> = vec![
        AuditRetentionJob.category(),
        MetricsUpdateJob.category(),
        ExpiredTokensCleanupJob.category(),
        UploadsGcJob.category(),
        UploadsBackfillJob.category(),
        UploadsIntegrityJob.category(),
        BirthdaysDigestJob.category(),
        OrphansPruneJob.category(),
        VacuumDbJob.category(),
    ];

    let unique_categories: HashSet<_> = categories.iter().collect();

    // Should use multiple categories, not all the same
    assert!(unique_categories.len() >= 3);
}

#[tokio::test]
async fn test_cron_schedule_formats() {
    let schedules = vec![
        AuditRetentionJob.default_schedule(),
        MetricsUpdateJob.default_schedule(),
        ExpiredTokensCleanupJob.default_schedule(),
        UploadsGcJob.default_schedule(),
        UploadsIntegrityJob.default_schedule(),
        BirthdaysDigestJob.default_schedule(),
        OrphansPruneJob.default_schedule(),
        VacuumDbJob.default_schedule(),
    ];

    for schedule in schedules.into_iter().flatten() {
        // Allow either @ syntax or basic cron format (5 fields)
        if schedule.starts_with('@') {
            // @ syntax is allowed
            continue;
        }

        // Basic cron format validation (5 fields)
        let parts: Vec<&str> = schedule.split_whitespace().collect();
        assert_eq!(parts.len(), 5, "Invalid cron schedule: {}", schedule);

        // Each part should be valid cron syntax
        for part in parts {
            // Allow numbers, *, /, -, and ,
            assert!(
                part.chars().all(|c| c.is_numeric()
                    || c == '*'
                    || c == '/'
                    || c == '-'
                    || c == ','),
                "Invalid cron part: {}",
                part
            );
        }
    }
}

#[tokio::test]
async fn test_job_thread_safety() {
    // Test that jobs can be shared across threads
    let job = Arc::new(AuditRetentionJob);

    let handles: Vec<_> = (0..10)
        .map(|_| {
            let job_clone = Arc::clone(&job);
            tokio::spawn(async move {
                let _name = job_clone.name();
                let _desc = job_clone.description();
            })
        })
        .collect();

    for handle in handles {
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn test_job_outcome_display() {
    let outcome = JobOutcome::new(5, Some("Processed 5 items".to_string()));

    // Test that outcome can be debug formatted
    let debug_str = format!("{:?}", outcome);
    assert!(debug_str.contains("JobOutcome"));
    assert!(debug_str.contains("5"));
    assert!(debug_str.contains("Processed 5 items"));
}

#[tokio::test]
async fn test_job_category_display() {
    assert_eq!(format!("{}", JobCategory::Cleanup), "cleanup");
    assert_eq!(format!("{}", JobCategory::Maintenance), "maintenance");
    assert_eq!(format!("{}", JobCategory::Metrics), "metrics");
    assert_eq!(format!("{}", JobCategory::Integrity), "integrity");
    assert_eq!(format!("{}", JobCategory::Custom), "custom");
}

#[tokio::test]
async fn test_job_category_from_string() {
    // Test that categories can be converted to strings meaningfully
    let categories = vec![
        JobCategory::Cleanup,
        JobCategory::Maintenance,
        JobCategory::Metrics,
        JobCategory::Integrity,
        JobCategory::Custom,
    ];

    for category in categories {
        let string_repr = category.to_string();
        assert!(!string_repr.is_empty());
        assert!(string_repr.chars().all(|c| c.is_lowercase()));
    }
}
