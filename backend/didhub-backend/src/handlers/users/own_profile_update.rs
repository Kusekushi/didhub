use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;

use didhub_db::generated::users as db_users;

use crate::handlers::users::dto::UpdateUserDto;
use crate::{error::ApiError, state::AppState};

/// Update the current authenticated user's profile (display_name, about_me)
pub async fn own_profile_update(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

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
    let existing = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("user not found"))?;

    if let Some(display) = dto.display_name {
        existing.display_name = Some(display);
    }
    if let Some(about) = dto.about_me {
        existing.about_me = Some(about);
    }
    existing.updated_at = chrono::Utc::now().to_rfc3339();

    let affected = db_users::update_by_primary_key(&mut *conn, &user_id, &existing)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("user not found"));
    }

    Ok(Json(
        serde_json::to_value(&existing).map_err(ApiError::from)?,
    ))
}
