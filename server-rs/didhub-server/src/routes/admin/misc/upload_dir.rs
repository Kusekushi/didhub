use crate::upload_dir::UploadDirCache;
use axum::{
    extract::{Extension, Query},
    Json,
};
use didhub_db::{audit, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Serialize;
use tracing::{debug, info, warn};

#[derive(Serialize)]
pub struct UploadDirResp {
    pub ok: bool,
    pub dir: String,
    pub moved: Vec<String>,
    pub skipped: Vec<String>,
    pub total: usize,
}

#[derive(serde::Deserialize)]
pub struct UploadDirQuery {
    pub action: String,
}

pub async fn upload_dir(
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(db): Extension<Db>,
    Query(query): Query<UploadDirQuery>,
) -> Result<Json<UploadDirResp>, AppError> {
    if user.is_admin == 0 {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to manage upload directory");
        return Err(AppError::Forbidden);
    }

    let action = query.action.as_str();

    match action {
        "reload" => {
            debug!(user_id=%user.id, "reloading upload directory");
            udc.invalidate().await;
            let dir = udc.current().await;
            info!(user_id=%user.id, upload_dir=%dir, "upload directory reloaded");

            let ip_arc = didhub_middleware::client_ip::get_request_ip();
            let ip = ip_arc.as_ref().map(|s| s.as_str());
            audit::record_with_metadata(
                &db,
                Some(user.id.as_str()),
                "admin.upload_dir.reload",
                Some("upload_dir"),
                Some(&dir),
                serde_json::json!({"dir": dir}),
                ip,
            )
            .await;

            Ok(Json(UploadDirResp {
                ok: true,
                dir,
                moved: vec![],
                skipped: vec![],
                total: 0,
            }))
        }
        "migrate" => {
            debug!(user_id=%user.id, "migrating uploads to current directory");

            // Use the UploadDirCache helper that returns moved/skipped filenames.
            match udc.migrate_previous_to_current_with_names().await {
                Ok((moved, skipped)) => {
                    let total = moved.len() + skipped.len();

                    let ip_arc = didhub_middleware::client_ip::get_request_ip();
                    let ip = ip_arc.as_ref().map(|s| s.as_str());
                    audit::record_with_metadata(
                        &db,
                        Some(user.id.as_str()),
                        "admin.upload_dir.migrate",
                        Some("upload_dir"),
                        None,
                        serde_json::json!({"moved": moved.len(), "skipped": skipped.len()}),
                        ip,
                    )
                    .await;

                    let dir = udc.current().await;

                    Ok(Json(UploadDirResp {
                        ok: true,
                        dir,
                        moved,
                        skipped,
                        total,
                    }))
                }
                Err(_) => Err(AppError::Internal),
            }
        }
        other => {
            warn!(user_id=%user.id, action=%other, "unknown upload_dir action request");
            Err(AppError::BadRequest("unknown action".to_string()))
        }
    }
}
