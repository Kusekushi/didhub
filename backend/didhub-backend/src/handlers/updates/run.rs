use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

/// POST /admin/update/run
/// Trigger an update using the update coordinator.
pub async fn run(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let started_at = Utc::now();

    // Create an update action and execute it
    let action = didhub_updates::UpdateAction::new(
        "manual_update",
        json!({
            "triggered_at": started_at.to_rfc3339(),
            "source": "admin_api"
        }),
    );

    // Enqueue the update as a job for tracking
    let job_request = didhub_job_queue::JobRequest::new(
        "update.execute",
        json!({
            "action": action.name,
            "triggered_at": started_at.to_rfc3339(),
        }),
    );

    let result = state
        .job_queue
        .enqueue(job_request)
        .await
        .map_err(ApiError::from)?;

    // Execute the update action (in a real implementation, this would be async)
    state
        .updates
        .execute(action)
        .await
        .map_err(ApiError::from)?;

    tracing::info!(job_id = %result.job_id, "update job enqueued");

    Ok(Json(json!({
        "startedAt": started_at.to_rfc3339(),
        "jobId": result.job_id,
        "status": "started",
        "message": "Update process has been initiated"
    })))
}
