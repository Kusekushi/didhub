use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;

use didhub_db::generated::users as db_users;

use crate::{error::ApiError, state::AppState};

/// Delete the current user's avatar (unset avatar field)
pub async fn own_avatar_delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("user not found"))?;
    existing.avatar = None;
    existing.updated_at = chrono::Utc::now().to_rfc3339();
    db_users::update_by_primary_key(&mut *conn, &user_id, &existing)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({"avatar": null})))
}
