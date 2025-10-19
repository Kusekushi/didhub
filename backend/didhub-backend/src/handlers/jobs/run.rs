use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

/// POST /admin/jobs/{jobName}/run
/// Manually trigger a job by name.
pub async fn run(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let job_name = path
        .get("jobName")
        .ok_or_else(|| ApiError::bad_request("missing jobName path parameter"))?;

    // Run the job through the job queue
    let run = state
        .job_queue
        .run_job(job_name, None)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(json!({
        "id": run.id,
        "jobName": run.job_name,
        "status": run.status.to_string(),
        "startedAt": run.started_at.to_rfc3339(),
        "finishedAt": run.finished_at.map(|dt| dt.to_rfc3339()),
    })))
}
