use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

/// POST /admin/backup
/// Trigger a database backup. Returns information about the backup job.
pub async fn run(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    // Create a backup job through the job queue
    let job_request = didhub_job_queue::JobRequest::new(
        "backup.create",
        json!({
            "triggered_at": Utc::now().to_rfc3339(),
            "type": "full"
        }),
    );

    let result = state.job_queue.enqueue(job_request).await.map_err(ApiError::from)?;

    // For SQLite, we can create an actual backup file
    // For other databases, this would trigger appropriate backup procedures
    let backup_id = Uuid::new_v4();
    let started_at = Utc::now();

    // Log the backup attempt
    tracing::info!(
        backup_id = %backup_id,
        job_id = %result.job_id,
        "backup job enqueued"
    );

    Ok(Json(json!({
        "backupId": backup_id,
        "jobId": result.job_id,
        "status": "pending",
        "startedAt": started_at.to_rfc3339(),
        "message": "Backup job has been queued for processing"
    })))
}
