use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use chrono::Utc;
use didhub_db::generated::users as db_users;

use crate::handlers::users::dto::CreateUserDto;
use crate::{error::ApiError, state::AppState};

/// Create a new user. Accepts a JSON body matching UsersRow (minimal validation).
pub async fn create(
    Extension(state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    let dto: CreateUserDto = serde_json::from_value(payload).map_err(ApiError::from)?;
    if let Err(issues) = dto.validate() {
        return Ok(Json(crate::validation::to_payload(&issues)));
    }

    // Check if this is an authenticated admin creating the user
    let is_admin_request =
        match crate::handlers::auth::utils::authenticate_optional(&state, &_headers).await {
            Ok(Some(auth)) => auth.scopes.iter().any(|s| s == "admin"),
            _ => false,
        };

    // Build UsersRow while stripping fields that should not be client-supplied.
    let now = Utc::now().to_rfc3339();

    // Hash password using didhub_auth - supports both client-side hashed and plaintext
    let password_hash = if didhub_auth::is_client_hash(&dto.password_hash) {
        didhub_auth::hash_client_password(&dto.password_hash)
    } else {
        didhub_auth::hash_password(&dto.password_hash)
    }
    .map_err(|e| ApiError::Unexpected(e.to_string()))?;

    // Determine roles for the new user
    let roles: Vec<String> = if is_admin_request {
        // Admin can set roles via dto.roles
        dto.roles.unwrap_or_default()
    } else {
        // Non-admin users start with no roles (awaiting approval)
        vec![]
    };
    let roles_json = serde_json::to_string(&roles).unwrap_or_else(|_| "[]".to_string());

    let new_row = db_users::UsersRow {
        id: SqlxUuid::new_v4(),
        username: dto.username,
        about_me: dto.about_me,
        password_hash,
        avatar: None,
        must_change_password: 0,
        last_login_at: None,
        display_name: dto.display_name,
        created_at: now.clone(),
        updated_at: now,
        roles: roles_json,
        settings: "{}".to_string(),
    };

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_users::insert_user(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(&new_row).map_err(ApiError::from)?,
    ))
}
