use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use didhub_db::generated::users as db_users;

use crate::{error::ApiError, state::AppState};

/// Delete a user by id. Only admin or owner may delete.
pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let auth = crate::handlers::auth::utils::authenticate_required(&state, &headers).await?;

    let id_str = path
        .get("userId")
        .ok_or_else(|| ApiError::not_found("user id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    crate::handlers::auth::utils::ensure_admin_or_user(&auth, id)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let affected = db_users::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;

    if affected == 0 {
        return Err(ApiError::not_found("user not found"));
    }

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
