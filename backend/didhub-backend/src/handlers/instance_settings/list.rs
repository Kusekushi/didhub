use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use axum::http::HeaderMap;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::instance_settings::list_all;

use super::helpers::row_to_setting;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let params = query.map(|q| q.0).unwrap_or_default();

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let rows = list_all(&mut *conn).await.map_err(ApiError::from)?;

    // Parse keys from query params (comma-separated or as array-like string)
    let keys: Option<Vec<String>> = params
        .get("keys")
        .map(|v| v.split(',').map(|s| s.trim().to_string()).collect());

    let items: Vec<Value> = if let Some(keys) = keys {
        rows.into_iter()
            .filter(|row| keys.contains(&row.key))
            .map(row_to_setting)
            .collect()
    } else {
        rows.into_iter().map(row_to_setting).collect()
    };

    Ok(Json(json!({ "items": items })))
}
