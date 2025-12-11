use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::response::Json;
use serde_json::json;

use crate::{error::ApiError, handlers::auth::utils::extract_auth_token, state::AppState};

/// GET /auth/me
/// Inspect the didhub_session cookie and return basic user info if valid.
pub async fn me(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let bearer = extract_auth_token(&headers).ok_or_else(|| {
        ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed)
    })?;

    // Verify via configured authenticator (which supports HS256/RS256 verification)
    let auth = state
        .authenticator()
        .authenticate(Some(bearer.as_str()))
        .await
        .map_err(ApiError::from)?;

    if !auth.is_authenticated() {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    // Fetch username, avatar, and roles from database
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let row: (String, Option<String>, String) =
        sqlx::query_as("SELECT username, avatar, roles FROM users WHERE id = ?")
            .bind(user_id)
            .fetch_one(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    // Parse roles to check if user has 'system' role
    let roles: Vec<String> = serde_json::from_str(&row.2).unwrap_or_default();
    let is_system = roles.iter().any(|r| r == "system");

    Ok(Json(
        json!({ "user_id": user_id, "username": row.0, "avatar": row.1, "isSystem": is_system, "scopes": auth.scopes }),
    ))
}
