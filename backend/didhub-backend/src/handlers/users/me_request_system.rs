use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use chrono::Utc;
use didhub_db::generated::{pending_system_requests as db_requests, users as db_users};

use crate::{error::ApiError, state::AppState};

/// Helper to check if a user has a specific role
fn user_has_role(roles_json: &str, role: &str) -> bool {
    serde_json::from_str::<Vec<String>>(roles_json)
        .map(|roles| roles.iter().any(|r| r == role))
        .unwrap_or(false)
}

/// Request system account status for the current user
pub async fn me_request_system(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let note = body
        .as_ref()
        .and_then(|j| j.0.get("note"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let existing_request = db_requests::find_first_by_user_id(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;

    if existing_request.is_some() {
        return Err(ApiError::bad_request(
            "You already have a pending system request",
        ));
    }

    let user = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let user = user.ok_or_else(|| ApiError::not_found("user not found"))?;

    // Check if user already has 'system' role
    if user_has_role(&user.roles, "system") {
        return Err(ApiError::bad_request("You are already a system account"));
    }

    let now = Utc::now().to_rfc3339();
    let request_id = SqlxUuid::new_v4();
    let new_request = db_requests::PendingSystemRequestsRow {
        id: request_id,
        user_id,
        note: note.clone(),
        created_at: now.clone(),
    };

    db_requests::insert_pending_system_request(&mut *conn, &new_request)
        .await
        .map_err(ApiError::from)?;

    let response = serde_json::json!({
        "id": request_id,
        "userId": user_id,
        "message": note,
        "status": "pending",
        "createdAt": now
    });

    Ok(Json(response))
}
