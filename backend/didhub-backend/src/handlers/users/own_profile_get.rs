use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;

use didhub_db::generated::users as db_users;

use crate::{error::ApiError, state::AppState};

/// Get the current authenticated user's profile (display_name, about_me, avatar)
pub async fn own_profile_get(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let user = opt.ok_or_else(|| ApiError::not_found("user not found"))?;

    let out = serde_json::json!({
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "about_me": user.about_me,
        "avatar": user.avatar,
    });

    Ok(Json(out))
}
