use axum::{extract::Extension, http::HeaderMap, Json};
use serde_json::{json, Value};
use std::sync::Arc;

use crate::error::ApiError;
use crate::state::AppState;

pub async fn clear(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(
        json!({ "cleared": false, "message": "Log clearing via API is no longer supported with the tracing-based logger." }),
    ))
}
