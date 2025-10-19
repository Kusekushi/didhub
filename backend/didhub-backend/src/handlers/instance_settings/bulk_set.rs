use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

use super::helpers::{row_to_setting, upsert_instance_setting, InstanceSettingsPayload};

pub async fn bulk_set(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: InstanceSettingsPayload =
        serde_json::from_value(payload_value).map_err(ApiError::from)?;

    if payload.items.is_empty() {
        return Ok(Json(json!({ "items": Vec::<Value>::new() })));
    }

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let mut items = Vec::with_capacity(payload.items.len());
    for item in payload.items {
        let row = upsert_instance_setting(&mut conn, &item.key, &item.value).await?;
        items.push(row_to_setting(row));
    }

    Ok(Json(json!({ "items": items })))
}
