use anyhow::Result;
use chrono::{Duration, Utc};
use didhub_db::alters::AlterOperations;
use didhub_db::audit;
use didhub_db::common::CommonOperations;
use didhub_db::housekeeping::HousekeepingOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_db::settings::SettingOperations;
use didhub_db::uploads::UploadOperations;
use didhub_db::users::UserOperations;
use didhub_db::Db;
use didhub_db::NewUpload;
use futures::future::BoxFuture;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

pub trait Job: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>>;
}

#[derive(Debug, Clone)]
pub struct JobOutcome {
    pub rows_affected: i64,
    pub message: Option<String>,
}

pub struct AuditRetentionJob;

impl Job for AuditRetentionJob {
    fn name(&self) -> &'static str {
        "audit_retention"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            debug!("starting audit retention job");
            // Fetch retention days from settings (key: audit.retention.days) expecting integer days as string or JSON number.
            let setting = db.get_setting("audit.retention.days").await?;
            let Some(s) = setting else {
                info!("audit retention not configured - skipping");
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("retention not configured".into()),
                });
            };
            // Parse value: allow plain integer in string (e.g. "30") or JSON object/number.
            let days_opt = if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s.value) {
                match v {
                    serde_json::Value::Number(n) => n.as_i64(),
                    serde_json::Value::String(st) => st.parse::<i64>().ok(),
                    _ => None,
                }
            } else {
                s.value.parse::<i64>().ok()
            };
            let Some(days) = days_opt else {
                warn!(setting_value=%s.value, "invalid audit retention days value");
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("invalid retention days value".into()),
                });
            };
            if days <= 0 {
                info!(retention_days=%days, "non-positive retention days - skipping audit cleanup");
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("non-positive retention days".into()),
                });
            }
            let cutoff = Utc::now() - Duration::days(days);
            let cutoff_str = cutoff.to_rfc3339();
            debug!(retention_days=%days, cutoff=%cutoff_str, "purging old audit records");
            let purged = db.purge_audit_before(&cutoff_str).await?;
            info!(purged_rows=%purged, retention_days=%days, cutoff=%cutoff_str, "audit retention job completed");
            Ok(JobOutcome {
                rows_affected: purged,
                message: Some(format!(
                    "purged {} audit rows before {}",
                    purged, cutoff_str
                )),
            })
        })
    }
}

#[derive(Clone)]
pub struct JobRegistry {
    inner: Arc<RwLock<Vec<Arc<dyn Job>>>>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(Vec::new())),
        }
    }
    pub async fn register<J: Job + 'static>(&self, job: J) {
        self.inner.write().await.push(Arc::new(job));
    }
    pub async fn list(&self) -> Vec<String> {
        self.inner
            .read()
            .await
            .iter()
            .map(|j| j.name().to_string())
            .collect()
    }
    pub async fn get(&self, name: &str) -> Option<Arc<dyn Job>> {
        self.inner
            .read()
            .await
            .iter()
            .find(|j| j.name() == name)
            .cloned()
    }
}

pub async fn build_default_registry() -> JobRegistry {
    let reg = JobRegistry::new();
    reg.register(AuditRetentionJob).await;
    reg.register(BirthdaysDigestJob).await;
    reg.register(UploadsGcJob).await;
    reg.register(UploadsBackfillJob).await;
    reg.register(UploadsIntegrityJob).await;
    reg.register(OrphansPruneJob).await;
    reg.register(VacuumDbJob).await;
    reg
}

// Manual trigger execution helper
pub async fn run_job_by_name(registry: &JobRegistry, db: &Db, name: &str) -> Result<(i64, String)> {
    info!(job_name=%name, "starting housekeeping job execution");
    if let Some(job) = registry.get(name).await {
        let run = db.start_housekeeping_run(name).await?;
        info!(job_name=%name, run_id=%run.id, "housekeeping job run started");
        let outcome_res = job.run(db).await;
        match outcome_res {
            Ok(out) => {
                info!(
                    job_name=%name,
                    run_id=%run.id,
                    rows_affected=%out.rows_affected,
                    message=?out.message,
                    "housekeeping job completed successfully"
                );
                db.finish_housekeeping_run(
                    run.id,
                    true,
                    out.message.as_deref(),
                    Some(out.rows_affected),
                )
                .await?;
                Ok((out.rows_affected, out.message.unwrap_or_default()))
            }
            Err(e) => {
                error!(
                    job_name=%name,
                    run_id=%run.id,
                    error=%e,
                    "housekeeping job failed"
                );
                db.finish_housekeeping_run(run.id, false, Some(&e.to_string()), None)
                    .await?;
                Err(e)
            }
        }
    } else {
        warn!(job_name=%name, "housekeeping job not found in registry");
        anyhow::bail!(format!("job '{}' not found", name));
    }
}

// Simple periodic runner: every 6 hours run audit_retention if configured.
pub async fn spawn_scheduler(registry: JobRegistry, db: Db) {
    info!("starting housekeeping scheduler - will run audit_retention every 6 hours");
    tokio::spawn(async move {
        loop {
            debug!("housekeeping scheduler tick - checking audit_retention job");
            // run audit_retention silently (log only)
            if let Some(job) = registry.get("audit_retention").await {
                match job.run(&db).await {
                    Ok(out) => {
                        if out.rows_affected > 0 {
                            info!(
                                job_name="audit_retention",
                                rows_affected=%out.rows_affected,
                                message=?out.message,
                                "scheduled audit retention job completed with changes"
                            );
                        } else {
                            debug!(
                                job_name="audit_retention",
                                rows_affected=%out.rows_affected,
                                message=?out.message,
                                "scheduled audit retention job completed - no changes"
                            );
                        }
                    }
                    Err(e) => {
                        error!(
                            job_name="audit_retention",
                            error=%e,
                            "scheduled audit retention job failed"
                        );
                    }
                }
            } else {
                warn!("audit_retention job not found in registry during scheduled run");
            }
            info!("housekeeping scheduler sleeping for 6 hours");
            tokio::time::sleep(std::time::Duration::from_secs(6 * 60 * 60)).await;
            // 6h
        }
    });
}

pub struct BirthdaysDigestJob;

impl Job for BirthdaysDigestJob {
    fn name(&self) -> &'static str {
        "birthdays_digest"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            // Check webhook presence (try new key first, fall back to old key for compatibility)
            let webhook = db.get_setting("discord_webhook_url").await?;
            let webhook = if webhook.is_none() {
                db.get_setting("discord.webhook").await?
            } else {
                webhook
            };
            if webhook.is_none() {
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("no webhook configured".into()),
                });
            }
            let alters = db.upcoming_birthdays(7).await.unwrap_or_default();
            if alters.is_empty() {
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("no upcoming birthdays".into()),
                });
            }
            let names: Vec<String> = alters
                .iter()
                .map(|a| {
                    if let Some(b) = &a.birthday {
                        format!("{} ({})", a.name, b)
                    } else {
                        a.name.clone()
                    }
                })
                .collect();
            audit::record_with_metadata(
                &db,
                None,
                "digest.birthdays",
                Some("digest"),
                None,
                json!({"count": names.len(), "entries": names}),
            )
            .await;
            Ok(JobOutcome {
                rows_affected: alters.len() as i64,
                message: Some("birthdays digest recorded".into()),
            })
        })
    }
}

pub struct UploadsGcJob;

impl Job for UploadsGcJob {
    fn name(&self) -> &'static str {
        "uploads_gc"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            info!("starting uploads garbage collection job");
            // Determine retention days; default 7
            let days_setting = db
                .get_setting("uploads.gc.days")
                .await
                .ok()
                .flatten()
                .map(|s| s.value)
                .unwrap_or_else(|| "7".into());
            let days: i64 = days_setting.parse().unwrap_or(7);
            if days <= 0 {
                info!(retention_days=%days, "uploads GC disabled (non-positive days)");
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("gc disabled (non-positive days)".into()),
                });
            }
            debug!(retention_days=%days, "scanning for referenced upload files");
            // Build referenced set from avatars + uploads table entries
            let mut referenced: std::collections::HashSet<String> =
                std::collections::HashSet::new();
            // Paginate users to avoid large single query memory (batch 1000)
            let mut offset = 0i64;
            let batch = 1000i64;
            loop {
                if let Ok(users) = db.list_users(batch, offset).await {
                    let count = users.len();
                    for u in users {
                        if let Some(av) = u.avatar {
                            referenced.insert(av);
                        }
                    }
                    if count < batch as usize {
                        break;
                    }
                    offset += batch;
                } else {
                    break;
                }
            }
            if let Ok(upload_names) = db.list_upload_filenames().await {
                for n in upload_names {
                    referenced.insert(n);
                }
            }
            debug!(referenced_count=%referenced.len(), "found referenced files");

            // Scan upload directory
            let upload_dir = if let Ok(env_dir) = std::env::var("UPLOAD_DIR") {
                env_dir
            } else if let Ok(Some(s)) = db.get_setting("app.upload_dir").await {
                s.value
            } else {
                "uploads".into()
            };
            let dir = PathBuf::from(&upload_dir);
            if !dir.exists() {
                warn!(upload_dir=%upload_dir, "upload directory missing");
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("upload dir missing".into()),
                });
            }
            let cutoff = chrono::Utc::now() - Duration::days(days);
            let mut removed: i64 = 0;
            let mut rd = fs::read_dir(&dir).await?;
            while let Some(ent) = rd.next_entry().await? {
                let meta = ent.metadata().await?;
                if !meta.is_file() {
                    continue;
                }
                if let Some(name) = ent.file_name().to_str() {
                    if referenced.contains(name) {
                        debug!(filename=%name, "keeping referenced file");
                        continue;
                    }
                }
                // Previously limited to hashed PNGs; now remove any unreferenced file older than retention.
                // Fallback: remove if file older than retention by comparing system time
                let older_than = meta
                    .modified()
                    .ok()
                    .map(|mtime| {
                        let dt: chrono::DateTime<chrono::Utc> = mtime.into();
                        dt < cutoff
                    })
                    .unwrap_or(false);
                if older_than {
                    let path = ent.path();
                    let filename = path.file_name().unwrap().to_string_lossy();
                    debug!(filename=%filename, "removing orphaned file");
                    if fs::remove_file(&path).await.is_ok() {
                        removed += 1;
                        audit::record_with_metadata(
                            &db,
                            None,
                            "uploads.gc.delete",
                            Some("upload"),
                            path.file_name().and_then(|s| s.to_str()),
                            json!({"days": days}),
                        )
                        .await;
                    }
                }
            }
            // Purge soft-deleted past retention
            let del_ret_days = db
                .get_setting("uploads.delete.retention.days")
                .await
                .ok()
                .flatten()
                .and_then(|s| s.value.parse::<i64>().ok())
                .unwrap_or(30);
            if del_ret_days >= 0 {
                let cutoff = chrono::Utc::now() - Duration::days(del_ret_days);
                let cutoff_str = cutoff.to_rfc3339();
                let purged = db.purge_deleted_before(&cutoff_str).await.unwrap_or(0);
                if purged > 0 {
                    debug!(purged_count=%purged, cutoff=%cutoff_str, "purging soft-deleted uploads");
                    audit::record_with_metadata(
                        &db,
                        None,
                        "uploads.purge",
                        Some("upload"),
                        None,
                        json!({"purged": purged, "cutoff": cutoff_str}),
                    )
                    .await;
                }
                removed += purged; // aggregate effect count
            }
            info!(removed_files=%removed, retention_days=%days, "uploads GC job completed");
            Ok(JobOutcome {
                rows_affected: removed,
                message: Some(format!("removed {} orphaned/purged images", removed)),
            })
        })
    }
}

pub struct UploadsBackfillJob;

impl Job for UploadsBackfillJob {
    fn name(&self) -> &'static str {
        "uploads_backfill"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            // Skip if sentinel indicates done
            if let Ok(Some(done)) = db.get_setting("uploads.backfill.done").await {
                if done.value == "true" {
                    return Ok(JobOutcome {
                        rows_affected: 0,
                        message: Some("already completed".into()),
                    });
                }
            }
            let upload_dir = if let Ok(env_dir) = std::env::var("UPLOAD_DIR") {
                env_dir
            } else if let Ok(Some(s)) = db.get_setting("app.upload_dir").await {
                s.value
            } else {
                "uploads".into()
            };
            let dir = PathBuf::from(&upload_dir);
            if !dir.exists() {
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("upload dir missing".into()),
                });
            }
            let mut added: i64 = 0;
            let mut rd = fs::read_dir(&dir).await?;
            while let Some(ent) = rd.next_entry().await? {
                let meta = ent.metadata().await?;
                if !meta.is_file() {
                    continue;
                }
                let name = ent.file_name();
                let name = match name.to_str() {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                // Exists in DB?
                if db.fetch_upload_by_name(&name).await?.is_some() {
                    continue;
                }
                let bytes = meta.len() as i64;
                let mime = if name.ends_with(".png") {
                    Some("image/png")
                } else if name.ends_with(".jpg") || name.ends_with(".jpeg") {
                    Some("image/jpeg")
                } else if name.ends_with(".gif") {
                    Some("image/gif")
                } else if name.ends_with(".webp") {
                    Some("image/webp")
                } else {
                    None
                };
                let path = dir.join(&name);
                let data = tokio::fs::read(&path).await.unwrap_or_default();
                let hash = if data.len() < 20_000_000 {
                    Some(blake3::hash(&data).to_hex().to_string())
                } else {
                    None
                };
                let _ = db
                    .insert_upload(NewUpload {
                        stored_name: &name,
                        original_name: None,
                        user_id: None,
                        mime,
                        bytes,
                        hash: hash.as_deref(),
                    })
                    .await;
                added += 1;
            }
            let _ = db.upsert_setting("uploads.backfill.done", "true").await;
            audit::record_with_metadata(
                &db,
                None,
                "uploads.backfill",
                Some("upload"),
                None,
                json!({"added": added}),
            )
            .await;
            Ok(JobOutcome {
                rows_affected: added,
                message: Some(format!("added {} missing upload rows", added)),
            })
        })
    }
}

pub struct UploadsIntegrityJob;

impl Job for UploadsIntegrityJob {
    fn name(&self) -> &'static str {
        "uploads_integrity"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            let upload_dir = if let Ok(env_dir) = std::env::var("UPLOAD_DIR") {
                env_dir
            } else if let Ok(Some(s)) = db.get_setting("app.upload_dir").await {
                s.value
            } else {
                "uploads".into()
            };
            let dir = PathBuf::from(&upload_dir);
            if !dir.exists() {
                return Ok(JobOutcome {
                    rows_affected: 0,
                    message: Some("upload dir missing".into()),
                });
            }
            let mut db_names = std::collections::HashSet::new();
            // Paginate through uploads to avoid large memory spikes (batch 5000)
            let mut offset = 0i64;
            let batch = 5000i64;
            loop {
                match db
                    .list_uploads_filtered(None, None, None, false, batch, offset)
                    .await
                {
                    Ok(rows) => {
                        let count = rows.len();
                        for r in rows {
                            db_names.insert(r.stored_name);
                        }
                        if count < batch as usize {
                            break;
                        }
                        offset += batch;
                    }
                    Err(_) => {
                        break;
                    }
                }
            }
            let mut fs_names = std::collections::HashSet::new();
            let mut rd = fs::read_dir(&dir).await?;
            while let Some(ent) = rd.next_entry().await? {
                if ent.metadata().await?.is_file() {
                    if let Some(n) = ent.file_name().to_str() {
                        fs_names.insert(n.to_string());
                    }
                }
            }
            // Missing on FS
            let mut issues: i64 = 0;
            for name in db_names.iter() {
                if !fs_names.contains(name) {
                    issues += 1;
                    audit::record_with_metadata(
                        &db,
                        None,
                        "upload.missing_file",
                        Some("upload"),
                        Some(name),
                        json!({"issue": "file_missing"}),
                    )
                    .await;
                }
            }
            // Untracked files
            for name in fs_names.iter() {
                if !db_names.contains(name) {
                    issues += 1;
                    audit::record_with_metadata(
                        &db,
                        None,
                        "upload.untracked_file",
                        Some("upload"),
                        Some(name),
                        json!({"issue": "untracked"}),
                    )
                    .await;
                }
            }
            Ok(JobOutcome {
                rows_affected: issues,
                message: Some(format!("integrity issues detected: {}", issues)),
            })
        })
    }
}

pub struct OrphansPruneJob;

impl Job for OrphansPruneJob {
    fn name(&self) -> &'static str {
        "orphans_prune"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            // Example orphan conditions: group_members referencing missing group or alter
            let removed = db.prune_orphan_group_members().await.unwrap_or(0)
                + db.prune_orphan_subsystem_members().await.unwrap_or(0);
            if removed > 0 {
                audit::record_with_metadata(
                    &db,
                    None,
                    "orphans.prune",
                    Some("housekeeping"),
                    None,
                    json!({"removed": removed}),
                )
                .await;
            }
            Ok(JobOutcome {
                rows_affected: removed,
                message: Some(format!("removed {} orphan membership rows", removed)),
            })
        })
    }
}

pub struct VacuumDbJob;

impl Job for VacuumDbJob {
    fn name(&self) -> &'static str {
        "db_vacuum"
    }
    fn run(&self, db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
        let db = db.clone();
        Box::pin(async move {
            let affected = db.perform_database_maintenance().await?;
            audit::record_simple(&db, None, "db.vacuum").await;
            Ok(JobOutcome {
                rows_affected: affected,
                message: Some("vacuum/optimize invoked".into()),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    // Mock job for testing
    struct MockJob {
        job_name: String,
        should_succeed: bool,
    }

    impl MockJob {
        fn new(name: String, should_succeed: bool) -> Self {
            Self {
                job_name: name,
                should_succeed,
            }
        }
    }

    impl Job for MockJob {
        fn name(&self) -> &'static str {
            // For testing, we'll use a simple mapping
            match self.job_name.as_str() {
                "test_job_1" => "test_job_1",
                "test_job_2" => "test_job_2",
                "test_job" => "test_job",
                name if name.starts_with("concurrent_job_") => {
                    // Extract the number and return a corresponding static string
                    if let Some(num_str) = name.strip_prefix("concurrent_job_") {
                        match num_str {
                            "0" => "concurrent_job_0",
                            "1" => "concurrent_job_1",
                            "2" => "concurrent_job_2",
                            "3" => "concurrent_job_3",
                            "4" => "concurrent_job_4",
                            "5" => "concurrent_job_5",
                            "6" => "concurrent_job_6",
                            "7" => "concurrent_job_7",
                            "8" => "concurrent_job_8",
                            "9" => "concurrent_job_9",
                            _ => "concurrent_job_x",
                        }
                    } else {
                        "concurrent_job_x"
                    }
                }
                _ => "unknown_job",
            }
        }

        fn run(&self, _db: &Db) -> BoxFuture<'static, Result<JobOutcome>> {
            let should_succeed = self.should_succeed;
            let job_name = self.name().to_string();
            Box::pin(async move {
                if should_succeed {
                    Ok(JobOutcome {
                        rows_affected: 1,
                        message: Some(format!("{} completed successfully", job_name)),
                    })
                } else {
                    Err(anyhow::anyhow!("{} failed", job_name))
                }
            })
        }
    }

    #[tokio::test]
    async fn test_job_registry_new() {
        let registry = JobRegistry::new();
        assert_eq!(registry.list().await.len(), 0);
    }

    #[tokio::test]
    async fn test_job_registry_register_and_list() {
        let registry = JobRegistry::new();

        let job1 = MockJob::new("test_job_1".to_string(), true);
        let job2 = MockJob::new("test_job_2".to_string(), true);

        registry.register(job1).await;
        registry.register(job2).await;

        let jobs = registry.list().await;
        assert_eq!(jobs.len(), 2);
        assert!(jobs.contains(&"test_job_1".to_string()));
        assert!(jobs.contains(&"test_job_2".to_string()));
    }

    #[tokio::test]
    async fn test_job_registry_get_existing_job() {
        let registry = JobRegistry::new();
        let job = MockJob::new("test_job".to_string(), true);

        registry.register(job).await;

        let retrieved = registry.get("test_job").await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name(), "test_job");
    }

    #[tokio::test]
    async fn test_job_registry_get_nonexistent_job() {
        let registry = JobRegistry::new();

        let retrieved = registry.get("nonexistent_job").await;
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_build_default_registry() {
        let registry = build_default_registry().await;

        let jobs = registry.list().await;
        assert_eq!(jobs.len(), 8); // All 8 default jobs should be registered

        // Check that all expected jobs are present
        let expected_jobs = vec![
            "audit_retention",
            "birthdays_digest",
            "uploads_gc",
            "uploads_backfill",
            "uploads_integrity",
            "orphans_prune",
            "db_vacuum",
        ];

        for job_name in expected_jobs {
            assert!(
                jobs.contains(&job_name.to_string()),
                "Missing job: {}",
                job_name
            );
        }
    }

    #[tokio::test]
    async fn test_job_names() {
        // Test that all job implementations return the correct names
        assert_eq!(AuditRetentionJob.name(), "audit_retention");
        assert_eq!(BirthdaysDigestJob.name(), "birthdays_digest");
        assert_eq!(UploadsGcJob.name(), "uploads_gc");
        assert_eq!(UploadsBackfillJob.name(), "uploads_backfill");
        assert_eq!(UploadsIntegrityJob.name(), "uploads_integrity");
        assert_eq!(OrphansPruneJob.name(), "orphans_prune");
        assert_eq!(VacuumDbJob.name(), "db_vacuum");
    }

    #[tokio::test]
    async fn test_job_outcome_debug() {
        let outcome = JobOutcome {
            rows_affected: 42,
            message: Some("Test message".to_string()),
        };

        let debug_str = format!("{:?}", outcome);
        assert!(debug_str.contains("42"));
        assert!(debug_str.contains("Test message"));
    }

    #[tokio::test]
    async fn test_job_outcome_clone() {
        let outcome = JobOutcome {
            rows_affected: 100,
            message: Some("Clone test".to_string()),
        };

        let cloned = outcome.clone();
        assert_eq!(outcome.rows_affected, cloned.rows_affected);
        assert_eq!(outcome.message, cloned.message);
    }

    #[test]
    fn test_job_trait_is_send_sync() {
        // Test that Job trait objects are Send + Sync
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Box<dyn Job>>();
        assert_send_sync::<Arc<dyn Job>>();
    }

    #[tokio::test]
    async fn test_registry_thread_safety() {
        let registry = Arc::new(JobRegistry::new());

        // Spawn multiple tasks that register jobs concurrently
        let mut handles = vec![];

        for i in 0..10 {
            let registry_clone = Arc::clone(&registry);
            let job_name = format!("concurrent_job_{}", i);
            let handle = tokio::spawn(async move {
                let job = MockJob::new(job_name, true);
                registry_clone.register(job).await;
            });
            handles.push(handle);
        }

        // Wait for all tasks to complete
        for handle in handles {
            handle.await.unwrap();
        }

        // Verify all jobs were registered
        let jobs = registry.list().await;
        assert_eq!(jobs.len(), 10);

        for i in 0..10 {
            assert!(jobs.contains(&format!("concurrent_job_{}", i)));
        }
    }
}
