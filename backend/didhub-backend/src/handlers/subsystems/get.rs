use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

pub async fn get(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _path: Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may get
    crate::handlers::auth::utils::authenticate_and_require_approved(&_state, &_headers).await?;

    _state
        .audit_request(
            "GET",
            "/subsystems/{id}",
            &_path.0,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let id_str = _path
        .0
        .get("subsystemId")
        .or_else(|| _path.0.get("id"))
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::not_found("subsystem id missing"))?;

    let id = SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_subsystems::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => Ok(Json(serde_json::to_value(&row).map_err(ApiError::from)?)),
        None => Err(ApiError::not_found("subsystem not found")),
    }
}
