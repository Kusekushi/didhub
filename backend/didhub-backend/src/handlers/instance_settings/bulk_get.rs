use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

use super::helpers::{fetch_instance_setting, row_to_setting, BulkGetRequest};

pub async fn bulk_get(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: BulkGetRequest = serde_json::from_value(payload_value).map_err(ApiError::from)?;

    if payload.keys.is_empty() {
        return Ok(Json(json!({ "values": Vec::<Value>::new() })));
    }

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let mut values = Vec::new();
    for key in payload.keys {
        if let Some(row) = fetch_instance_setting(&mut conn, &key).await? {
            values.push(row_to_setting(row));
        }
    }

    Ok(Json(json!({ "values": values })))
}
