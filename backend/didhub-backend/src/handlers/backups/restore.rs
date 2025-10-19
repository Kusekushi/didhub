use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

#[derive(Deserialize)]
struct RestoreRequest {
    #[serde(rename = "uploadId")]
    upload_id: Uuid,
}

/// POST /admin/restore
/// Restore from a backup. Accepts { uploadId: uuid } referencing an uploaded backup file.
pub async fn restore(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    
    let request: RestoreRequest = serde_json::from_value(payload_value)
        .map_err(|e| ApiError::bad_request(format!("invalid request body: {}", e)))?;

    // Verify the upload exists
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let upload = didhub_db::generated::uploads::find_by_primary_key(&mut *conn, &request.upload_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("backup upload not found"))?;

    // Create a restore job through the job queue
    let job_request = didhub_job_queue::JobRequest::new(
        "backup.restore",
        json!({
            "upload_id": request.upload_id,
            "stored_name": upload.stored_name,
            "triggered_at": Utc::now().to_rfc3339(),
        }),
    );

    let result = state.job_queue.enqueue(job_request).await.map_err(ApiError::from)?;

    // Log the restore attempt
    tracing::info!(
        upload_id = %request.upload_id,
        job_id = %result.job_id,
        "restore job enqueued"
    );

    Ok(Json(json!({
        "jobId": result.job_id,
        "uploadId": request.upload_id,
        "status": "pending",
        "startedAt": Utc::now().to_rfc3339(),
        "message": "Restore job has been queued for processing"
    })))
}
