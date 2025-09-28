use crate::routes_common::require_admin;
use crate::upload_dir::UploadDirCache;
use axum::{
    extract::{Extension, Path, Query},
    Json,
};
use didhub_cache::AppCache;
use didhub_db::audit;
use didhub_db::uploads::UploadOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Deserialize;
use std::path::PathBuf;
use tracing::{debug, info, warn};

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub mime: Option<String>,
    pub hash: Option<String>,
    pub user_id: Option<i64>,
    pub include_deleted: Option<bool>,
}

pub async fn list_uploads_admin(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(p): Query<ListParams>,
    Extension(cache): Extension<AppCache>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&user)?;
    let limit = p.limit.unwrap_or(50).clamp(1, 500);
    let offset = p.offset.unwrap_or(0).max(0);
    debug!(user_id=%user.id, limit=%limit, offset=%offset, mime=?p.mime, hash=?p.hash, user_id_filter=?p.user_id, include_deleted=%p.include_deleted.unwrap_or(false), "admin listing uploads");
    let rows = db
        .list_uploads_filtered(
            p.mime.as_deref(),
            p.hash.as_deref(),
            p.user_id,
            p.include_deleted.unwrap_or(false),
            limit,
            offset,
        )
        .await
        .map_err(|_| AppError::Internal)?;
    let total = db
        .cached_count_uploads_filtered(
            &cache,
            p.mime.as_deref(),
            p.hash.as_deref(),
            p.user_id,
            p.include_deleted.unwrap_or(false),
        )
        .await
        .map_err(|_| AppError::Internal)?;
    debug!(user_id=%user.id, result_count=%rows.len(), total_count=%total, "admin uploads listed");
    Ok(Json(
        serde_json::json!({"items": rows, "limit": limit, "offset": offset, "total": total }),
    ))
}

#[derive(Deserialize)]
pub struct DeleteParams {
    pub force: Option<bool>,
}

pub async fn delete_upload_admin(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Path(name): Path<String>,
    Query(p): Query<DeleteParams>,
    Extension(_cfg): Extension<crate::config::AppConfig>,
    Extension(cache): Extension<AppCache>,
    Extension(udc): Extension<UploadDirCache>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&user)?;
    debug!(user_id=%user.id, filename=%name, force=%p.force.unwrap_or(false), "admin deleting upload");
    let existing = db
        .fetch_upload_by_name(&name)
        .await
        .map_err(|_| AppError::Internal)?;
    if existing.is_none() {
        warn!(user_id=%user.id, filename=%name, "admin attempted to delete non-existent upload");
        return Err(AppError::NotFound);
    }
    let mut removed = 0i64;
    let mut soft = false;
    if p.force.unwrap_or(false) {
        removed = db
            .delete_upload_by_name(&name)
            .await
            .map_err(|_| AppError::Internal)?;
    } else {
        let affected = db
            .soft_delete_upload(&name)
            .await
            .map_err(|_| AppError::Internal)?;
        if affected == 0 {
            // already soft deleted; treat as idempotent
            soft = true;
        } else {
            soft = true;
        }
    }
    // Remove file only on force (hard delete)
    if p.force.unwrap_or(false) {
        let upload_dir = PathBuf::from(udc.current().await);
        let path = upload_dir.join(&name);
        if path.exists() {
            let _ = tokio::fs::remove_file(&path).await;
        }
    }
    audit::record_with_metadata(
        &db,
        Some(user.id),
        if p.force.unwrap_or(false) {
            "upload.delete.force"
        } else {
            "upload.delete.soft"
        },
        Some("upload"),
        Some(&name),
        serde_json::json!({"hard_removed": removed, "soft": soft}),
    )
    .await;
    db.invalidate_upload_counts(&cache).await;
    info!(user_id=%user.id, filename=%name, hard_removed=%removed, soft=%soft, "admin upload deletion completed");
    Ok(Json(
        serde_json::json!({"ok": true, "hard_removed": removed, "soft": soft }),
    ))
}

#[derive(Deserialize)]
pub struct PurgeParams {
    pub purge_before: Option<String>,
    pub force: Option<bool>,
}

// Batch purge soft-deleted uploads older than purge_before (ISO timestamp). If force=1 also remove files.
pub async fn purge_uploads_admin(
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Query(p): Query<PurgeParams>,
    Extension(_cfg): Extension<crate::config::AppConfig>,
    Extension(cache): Extension<AppCache>,
    Extension(udc): Extension<UploadDirCache>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&user)?;
    let cutoff = if let Some(c) = &p.purge_before {
        c.clone()
    } else {
        chrono::Utc::now().to_rfc3339()
    };
    debug!(user_id=%user.id, cutoff=%cutoff, force=%p.force.unwrap_or(false), "admin purging deleted uploads");
    // Purge DB rows
    let purged = db
        .purge_deleted_before(&cutoff)
        .await
        .map_err(|_| AppError::Internal)?;
    let mut files_removed = 0i64;
    if p.force.unwrap_or(false) && purged > 0 {
        // Scan upload dir removing any orphaned files (since DB rows gone) that are hashed pattern
        let upload_dir = udc.current().await;
        let dir = std::path::PathBuf::from(&upload_dir);
        if dir.exists() {
            if let Ok(mut rd) = tokio::fs::read_dir(&dir).await {
                while let Ok(Some(ent)) = rd.next_entry().await {
                    if let Ok(meta) = ent.metadata().await {
                        if !meta.is_file() {
                            continue;
                        }
                    }
                    if let Some(name) = ent.file_name().to_str() {
                        let is_hashed = name.len() == 68
                            && name.ends_with(".png")
                            && name.chars().take(64).all(|c| c.is_ascii_hexdigit());
                        if !is_hashed {
                            continue;
                        }
                        // If file no longer referenced in DB (row purged) remove
                        if db
                            .fetch_upload_by_name(name)
                            .await
                            .map_err(|_| AppError::Internal)?
                            .is_none()
                        {
                            let path = dir.join(name);
                            if tokio::fs::remove_file(&path).await.is_ok() {
                                files_removed += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    audit::record_with_metadata(&db, Some(user.id), "uploads.purge.manual", Some("upload"), None, serde_json::json!({"purged": purged, "cutoff": cutoff, "files_removed": files_removed, "force": p.force.unwrap_or(false)})).await;
    db.invalidate_upload_counts(&cache).await;
    info!(user_id=%user.id, purged=%purged, files_removed=%files_removed, cutoff=%cutoff, "admin upload purge completed");
    Ok(Json(
        serde_json::json!({"ok": true, "purged": purged, "files_removed": files_removed }),
    ))
}
