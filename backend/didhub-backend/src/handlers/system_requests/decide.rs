use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::{pending_system_requests as db_requests, users as db_users};

pub async fn decide(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Admin only
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    state
        .audit_request(
            "POST",
            "/system-requests/{id}",
            &path,
            &HashMap::new(),
            &body.as_ref().map(|j| j.0.clone()).unwrap_or(Value::Null),
        )
        .await?;

    // Accept either requestId or id or fall back to the single path entry
    let id_str = path
        .get("requestId")
        .or_else(|| path.get("id"))
        .map(|s| s.to_string())
        .or_else(|| {
            // fallback: if single key present, use its value
            if path.len() == 1 {
                path.values().next().map(|s| s.to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| ApiError::not_found("request id missing"))?;

    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_requests::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let req = opt.ok_or_else(|| ApiError::not_found("system request not found"))?;

    // Parse decision from body
    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();
    let decision: String = serde_json::from_value(
        payload
            .get("decision")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing decision"))?,
    )
    .map_err(ApiError::from)?;

    // Load target user
    let user_id_str = req.user_id.to_string();
    let user_id: SqlxUuid = SqlxUuid::parse_str(&user_id_str)
        .map_err(|_| ApiError::bad_request("invalid user id in request"))?;
    let existing = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let mut user = existing.ok_or_else(|| ApiError::not_found("user not found"))?;

    match decision.as_str() {
        "approve" => {
            user.is_system = 1;
        }
        "reject" | "deny" => {
            // set to 2 to prevent new requests
            user.is_system = 2;
        }
        other => {
            return Err(ApiError::bad_request(format!(
                "unknown decision: {}",
                other
            )));
        }
    }

    // Persist user update
    let affected = db_users::update_by_primary_key(&mut *conn, &user.id, &user)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("user not found"));
    }

    // Delete the pending request row
    let _deleted = db_requests::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "updated": true })).map_err(ApiError::from)?,
    ))
}
