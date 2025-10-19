use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let key = path
        .get("key")
        .ok_or_else(|| ApiError::bad_request("missing key path parameter"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    sqlx::query("DELETE FROM instance_settings WHERE key = ?")
        .bind(key)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(json!({ "deleted": true })))
}
