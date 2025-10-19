use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::instance_settings::InstanceSettingsRow;

use super::helpers::row_to_setting;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let rows = sqlx::query_as::<_, InstanceSettingsRow>(
        "SELECT key, value_type, value_bool, value_number, value_string, created_at, updated_at FROM instance_settings ORDER BY key",
    )
    .fetch_all(&mut *conn)
    .await
    .map_err(ApiError::from)?;

    let items: Vec<Value> = rows.into_iter().map(row_to_setting).collect();
    Ok(Json(json!({ "items": items })))
}
