use crate::upload_dir::UploadDirCache;
use axum::{extract::Extension, Json};
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::{debug, info, warn};

#[derive(serde::Serialize)]
pub struct ReloadResp {
    pub ok: bool,
    pub dir: String,
}

pub async fn reload_upload_dir(
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(db): Extension<Db>,
) -> Result<Json<ReloadResp>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to reload upload directory");
        return Err(AppError::Forbidden);
    }

    debug!(user_id=%user.id, "reloading upload directory");
    udc.invalidate().await;
    let dir = udc.current().await;
    info!(user_id=%user.id, upload_dir=%dir, "upload directory reloaded");

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.upload_dir.reload",
        Some("upload_dir"),
        Some(&dir),
        serde_json::json!({"dir": dir}),
    )
    .await;

    Ok(Json(ReloadResp { ok: true, dir }))
}
