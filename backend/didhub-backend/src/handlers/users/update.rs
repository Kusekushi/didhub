use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use didhub_db::generated::users as db_users;

use crate::handlers::users::dto::UpdateUserDto;
use crate::{error::ApiError, state::AppState};

/// Update an existing user by id. Body should contain full UsersRow.
pub async fn update(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;
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

    let dto: UpdateUserDto = serde_json::from_value(payload).map_err(ApiError::from)?;
    if let Err(issues) = dto.validate() {
        return Err(ApiError::Validation(crate::validation::to_payload(&issues)));
    }

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_users::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("user not found"))?;

    if let Some(display) = dto.display_name {
        existing.display_name = Some(display);
    }
    if let Some(about) = dto.about_me {
        existing.about_me = Some(about);
    }
    // Only admins can update roles
    if is_admin {
        if let Some(roles) = dto.roles {
            existing.roles = serde_json::to_string(&roles).unwrap_or_else(|_| "[]".to_string());
        }
    }

    existing.updated_at = chrono::Utc::now().to_rfc3339();

    let affected = db_users::update_by_primary_key(&mut *conn, &id, &existing)
        .await
        .map_err(ApiError::from)?;

    if affected == 0 {
        return Err(ApiError::not_found("user not found"));
    }

    Ok(Json(
        serde_json::to_value(&existing).map_err(ApiError::from)?,
    ))
}
