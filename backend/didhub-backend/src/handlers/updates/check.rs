use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

/// GET /admin/update/check
/// Check for available updates using the update coordinator.
pub async fn check(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    // Use the update coordinator to check for updates
    let status = state.updates.check().await.map_err(ApiError::from)?;

    Ok(Json(json!({
        "currentVersion": status.current_version,
        "latestVersion": status.latest_version,
        "updateAvailable": status.update_available(),
        "pendingActions": status.pending_actions.len()
    })))
}
