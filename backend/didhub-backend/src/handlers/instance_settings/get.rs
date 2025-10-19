use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;

use crate::{error::ApiError, state::AppState};

use super::helpers::{fetch_instance_setting, row_to_setting};

pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let key = path
        .get("key")
        .ok_or_else(|| ApiError::bad_request("missing key path parameter"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let row = fetch_instance_setting(&mut conn, key)
        .await?
        .ok_or_else(|| ApiError::not_found("instance setting not found"))?;

    Ok(Json(row_to_setting(row)))
}
