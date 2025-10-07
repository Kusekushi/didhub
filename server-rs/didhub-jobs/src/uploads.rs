use super::*;
use chrono::{Duration, Utc};
use didhub_db::audit;
use didhub_db::NewUpload;
use didhub_db::settings::SettingOperations;
use didhub_db::uploads::UploadOperations;
use didhub_db::users::UserOperations;
use serde_json::json;
use std::path::PathBuf;
use tokio::fs;

/// Job for garbage collecting unreferenced upload files
pub struct UploadsGcJob;

#[async_trait]
impl Job for UploadsGcJob {
    fn name(&self) -> &'static str {
        "uploads_gc"
    }

    fn description(&self) -> &'static str {
        "Garbage collect unreferenced upload files and soft-deleted uploads"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Cleanup
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("0 2 * * *") // Daily at 2am
    }

    async fn run(&self, db: &didhub_db::Db, cancel_token: &CancellationToken) -> Result<JobOutcome> {
        tracing::info!("starting uploads garbage collection job");

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
            tracing::info!(retention_days=%days, "uploads GC disabled (non-positive days)");
            return Ok(JobOutcome::new(0, Some("gc disabled (non-positive days)".into())));
        }

        tracing::debug!(retention_days=%days, "scanning for referenced upload files");

        // Build referenced set from avatars + uploads table entries
        let mut referenced: std::collections::HashSet<String> =
            std::collections::HashSet::new();

        // Paginate users to avoid large single query memory (batch 1000)
        let mut offset = 0i64;
        let batch = 1000i64;
        loop {
            if cancel_token.is_cancelled() {
                tracing::info!("uploads GC job cancelled during user scan");
                return Ok(JobOutcome::new(0, Some("cancelled during user scan".into())));
            }
            
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

        tracing::debug!(referenced_count=%referenced.len(), "found referenced files");

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
            tracing::warn!(upload_dir=%upload_dir, "upload directory missing");
            return Ok(JobOutcome::new(0, Some("upload dir missing".into())));
        }

        let cutoff = Utc::now() - Duration::days(days);
        let mut removed: i64 = 0;
        let mut rd = fs::read_dir(&dir).await?;
        while let Some(ent) = rd.next_entry().await? {
            if cancel_token.is_cancelled() {
                tracing::info!("uploads GC job cancelled during file scan");
                return Ok(JobOutcome::new(removed, Some(format!("cancelled during file scan, removed {} files", removed))));
            }
            
            let meta = ent.metadata().await?;
            if !meta.is_file() {
                continue;
            }
            if let Some(name) = ent.file_name().to_str() {
                if referenced.contains(name) {
                    tracing::debug!(filename=%name, "keeping referenced file");
                    continue;
                }
            }
            // Check if file is older than retention
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
                tracing::debug!(filename=%filename, "removing orphaned file");
                if fs::remove_file(&path).await.is_ok() {
                    removed += 1;
                    audit::record_with_metadata(
                        db,
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
            let cutoff = Utc::now() - Duration::days(del_ret_days);
            let cutoff_str = cutoff.to_rfc3339();
            let purged = db.purge_deleted_before(&cutoff_str).await.unwrap_or(0);
            if purged > 0 {
                tracing::debug!(purged_count=%purged, cutoff=%cutoff_str, "purging soft-deleted uploads");
                audit::record_with_metadata(
                    db,
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

        tracing::info!(removed_files=%removed, retention_days=%days, "uploads GC job completed");
        Ok(JobOutcome::new(
            removed,
            Some(format!("removed {} orphaned/purged images", removed))
        ))
    }
}

/// Job for backfilling missing upload database entries
pub struct UploadsBackfillJob;

#[async_trait]
impl Job for UploadsBackfillJob {
    fn name(&self) -> &'static str {
        "uploads_backfill"
    }

    fn description(&self) -> &'static str {
        "Backfill missing upload database entries for existing files"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Maintenance
    }

    fn is_periodic(&self) -> bool {
        false // Run once, then disable
    }

    async fn run(&self, db: &didhub_db::Db, cancel_token: &CancellationToken) -> Result<JobOutcome> {
        // Skip if sentinel indicates done
        if let Ok(Some(done)) = db.get_setting("uploads.backfill.done").await {
            if done.value == "true" {
                return Ok(JobOutcome::new(0, Some("already completed".into())));
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
            return Ok(JobOutcome::new(0, Some("upload dir missing".into())));
        }

        let mut added: i64 = 0;
        let mut rd = fs::read_dir(&dir).await?;
        while let Some(ent) = rd.next_entry().await? {
            if cancel_token.is_cancelled() {
                tracing::info!("uploads backfill job cancelled during file scan");
                return Ok(JobOutcome::new(added, Some(format!("cancelled during file scan, added {} entries", added))));
            }
            
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
            db,
            None,
            "uploads.backfill",
            Some("upload"),
            None,
            json!({"added": added}),
        )
        .await;

        Ok(JobOutcome::new(
            added,
            Some(format!("added {} missing upload rows", added))
        ))
    }
}

/// Job for checking upload file integrity
pub struct UploadsIntegrityJob;

#[async_trait]
impl Job for UploadsIntegrityJob {
    fn name(&self) -> &'static str {
        "uploads_integrity"
    }

    fn description(&self) -> &'static str {
        "Check for missing files or untracked files in uploads"
    }

    fn category(&self) -> JobCategory {
        JobCategory::Integrity
    }

    fn default_schedule(&self) -> Option<&str> {
        Some("0 4 * * 0") // Weekly on Sunday at 4am
    }

    async fn run(&self, db: &didhub_db::Db, cancel_token: &CancellationToken) -> Result<JobOutcome> {
        let upload_dir = if let Ok(env_dir) = std::env::var("UPLOAD_DIR") {
            env_dir
        } else if let Ok(Some(s)) = db.get_setting("app.upload_dir").await {
            s.value
        } else {
            "uploads".into()
        };

        let dir = PathBuf::from(&upload_dir);
        if !dir.exists() {
            return Ok(JobOutcome::new(0, Some("upload dir missing".into())));
        }

        let mut db_names = std::collections::HashSet::new();
        // Paginate through uploads to avoid large memory spikes (batch 5000)
        let mut offset = 0i64;
        let batch = 5000i64;
        loop {
            if cancel_token.is_cancelled() {
                tracing::info!("uploads integrity job cancelled during DB scan");
                return Ok(JobOutcome::new(0, Some("cancelled during DB scan".into())));
            }
            
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
            if cancel_token.is_cancelled() {
                tracing::info!("uploads integrity job cancelled during filesystem scan");
                return Ok(JobOutcome::new(0, Some("cancelled during filesystem scan".into())));
            }
            
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
                    db,
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
                    db,
                    None,
                    "upload.untracked_file",
                    Some("upload"),
                    Some(name),
                    json!({"issue": "untracked"}),
                )
                .await;
            }
        }

        Ok(JobOutcome::new(
            issues,
            Some(format!("integrity issues detected: {}", issues))
        ))
    }
}