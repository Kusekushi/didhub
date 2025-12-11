use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use didhub_db::generated::users as db_users;

use crate::{error::ApiError, state::AppState};

/// Update a user's password. Only admin or owner may update.
pub async fn update_password(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let id_str = path
        .get("userId")
        .ok_or_else(|| ApiError::not_found("user id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_owner = auth.user_id.map(|uid| uid == id).unwrap_or(false);
    if !is_admin && !is_owner {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    let new_pass_hash: String =
        if let Some(hash) = payload.get("newPasswordHash").and_then(|v| v.as_str()) {
            hash.to_string()
        } else if let Some(pass) = payload.get("newPassword").and_then(|v| v.as_str()) {
            pass.to_string()
        } else if let Some(pass) = payload.get("password").and_then(|v| v.as_str()) {
            pass.to_string()
        } else {
            return Err(ApiError::bad_request("missing newPasswordHash"));
        };

    if didhub_auth::is_client_hash(&new_pass_hash) {
        // Valid SHA-256 hash format
    } else if new_pass_hash.len() < 8 {
        return Err(ApiError::bad_request("password too short"));
    }

    let password_hash = if didhub_auth::is_client_hash(&new_pass_hash) {
        didhub_auth::hash_client_password(&new_pass_hash)
    } else {
        didhub_auth::hash_password(&new_pass_hash)
    }
    .map_err(|e| ApiError::Unexpected(e.to_string()))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_users::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("user not found"))?;

    existing.password_hash = password_hash;
    existing.updated_at = chrono::Utc::now().to_rfc3339();

    let affected = db_users::update_by_primary_key(&mut *conn, &id, &existing)
        .await
        .map_err(ApiError::from)?;

    if affected == 0 {
        return Err(ApiError::not_found("user not found"));
    }

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "updated": true })).map_err(ApiError::from)?,
    ))
}
