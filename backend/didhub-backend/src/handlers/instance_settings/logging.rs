use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

use super::helpers::{fetch_instance_setting, upsert_instance_setting};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub filter: String,
}

pub async fn get_logging_config(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let row = fetch_instance_setting(&mut conn, "system.log_filter").await?;

    let filter = row
        .and_then(|r| r.value_string)
        .unwrap_or_else(|| "info".to_string());

    Ok(Json(json!({ "filter": filter })))
}

pub async fn set_logging_config(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    payload: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let Json(payload) = payload.ok_or_else(|| ApiError::bad_request("missing body"))?;

    let filter = payload
        .get("filter")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_request("missing 'filter' field"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    upsert_instance_setting(&mut conn, "system.log_filter", filter).await?;

    // Apply the filter at runtime if the reload handle is available
    if let Some(reload) = &state.reload_handle {
        let env_filter = tracing_subscriber::EnvFilter::try_new(filter)
            .map_err(|e| ApiError::bad_request(format!("invalid filter string: {e}")))?;

        (reload)(env_filter)
            .map_err(|e| ApiError::internal_error(format!("failed to reload logging: {e}")))?;
    }

    Ok(Json(json!({ "status": "ok" })))
}
