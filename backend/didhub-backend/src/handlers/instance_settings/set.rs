use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;

use crate::{error::ApiError, state::AppState};

use super::helpers::{row_to_setting, upsert_instance_setting, InstanceSettingInput};

pub async fn set(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let path_key = path
        .get("key")
        .ok_or_else(|| ApiError::bad_request("missing key path parameter"))?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: InstanceSettingInput =
        serde_json::from_value(payload_value).map_err(ApiError::from)?;

    if !payload.key.is_empty() && payload.key != *path_key {
        return Err(ApiError::bad_request("body key does not match path key"));
    }

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let row = upsert_instance_setting(&mut conn, path_key, &payload.value).await?;

    Ok(Json(row_to_setting(row)))
}
