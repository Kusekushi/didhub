use axum::{
    extract::{Extension, Query},
    http::HeaderMap,
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::ApiError;
use crate::state::AppState;

pub async fn list(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    let _ = query;
    let empty_items: Vec<Value> = Vec::new();
    let response = json!({
        "items": empty_items,
        "pagination": {
            "page": 1,
            "perPage": 20,
            "total": 0,
        },
        "message": "Log listing via API is no longer supported with the tracing-based logger."
    });

    Ok(Json(response))
}
