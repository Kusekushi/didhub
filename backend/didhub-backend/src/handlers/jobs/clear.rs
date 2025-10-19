use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

/// DELETE /admin/jobs/runs
/// Clear all job run history.
pub async fn clear_runs(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    state.job_queue.clear_runs().await;

    Ok(Json(json!({ "cleared": true })))
}
