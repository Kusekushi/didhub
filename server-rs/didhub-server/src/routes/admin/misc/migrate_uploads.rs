use crate::upload_dir::UploadDirCache;
use axum::{extract::Extension, Json};
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::{debug, info, warn};

#[derive(serde::Serialize)]
pub struct MigrateResp {
    pub ok: bool,
    pub moved: usize,
    pub skipped: usize,
}

pub async fn migrate_uploads(
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(db): Extension<Db>,
) -> Result<Json<MigrateResp>, AppError> {
    if user.is_admin == 0 {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to migrate uploads");
        return Err(AppError::Forbidden);
    }

    debug!(user_id=%user.id, "migrating uploads to current directory");
    let (moved, skipped) = udc
        .migrate_previous_to_current()
        .await
        .map_err(|_| AppError::Internal)?;

    info!(user_id=%user.id, moved=%moved, skipped=%skipped, "upload migration completed");

    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "admin.upload_dir.migrate",
        Some("upload_dir"),
        None,
        serde_json::json!({"moved": moved, "skipped": skipped}),
    )
    .await;

    Ok(Json(MigrateResp {
        ok: true,
        moved,
        skipped,
    }))
}
