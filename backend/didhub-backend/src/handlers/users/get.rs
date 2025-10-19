use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use didhub_db::generated::users as db_users;

use crate::{error::ApiError, state::AppState};

/// Get a single user by id.
pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;

    let id_str = path
        .get("userId")
        .ok_or_else(|| ApiError::not_found("user id missing"))?
        .to_string();

    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_users::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => Ok(Json(serde_json::to_value(&row).map_err(ApiError::from)?)),
        None => Err(ApiError::not_found("user not found")),
    }
}
