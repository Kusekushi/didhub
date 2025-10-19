use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

/// Delete an alter's image (removes from images array)
pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let alter_id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::not_found("alter id missing"))?
        .to_string();
    let alter_id: SqlxUuid = SqlxUuid::parse_str(&alter_id_str)
        .map_err(|_| ApiError::bad_request("invalid alter uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if alter.owner_user_id != user_id && !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    // Clear images array (remove all images)
    let mut updated_alter = alter;
    updated_alter.images = "[]".to_string();
    db_alters::update_by_primary_key(&mut *conn, &alter_id, &updated_alter)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!(null)))
}
