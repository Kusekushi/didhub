use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::handlers::utils::parse_positive_usize;
use crate::{error::ApiError, state::AppState};

/// GET /admin/jobs/runs
/// List job runs with optional filtering and pagination.
pub async fn list_runs(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let params = query.map(|value| value.0).unwrap_or_default();
    let page = parse_positive_usize(params.get("page"), 1, "page")?;
    let per_page = parse_positive_usize(params.get("perPage"), 20, "perPage")?;
    let offset = (page - 1) * per_page;
    let job_name_filter = params.get("jobName").map(|s| s.as_str());

    let total = state.job_queue.count_runs(job_name_filter).await;
    let runs = state
        .job_queue
        .list_runs(job_name_filter, per_page, offset)
        .await;

    let items: Vec<Value> = runs
        .into_iter()
        .map(|run| {
            json!({
                "id": run.id,
                "jobName": run.job_name,
                "status": run.status.to_string(),
                "startedAt": run.started_at.to_rfc3339(),
                "finishedAt": run.finished_at.map(|dt| dt.to_rfc3339()),
                "errorMessage": run.error_message,
            })
        })
        .collect();

    Ok(Json(json!({
        "items": items,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
        }
    })))
}
