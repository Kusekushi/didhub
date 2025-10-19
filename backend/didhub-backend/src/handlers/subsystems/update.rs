use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

pub async fn update(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _path: Path<HashMap<String, String>>,
    _body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Admin-only: accept Authorization header or session cookie
    let auth = match crate::handlers::auth::utils::authenticate_optional(&_state, &_headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let payload = _body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    _state
        .audit_request(
            "PATCH",
            "/subsystems/{id}",
            &_path.0,
            &HashMap::new(),
            &payload,
        )
        .await?;

    let id_str = _path
        .0
        .get("subsystemId")
        .or_else(|| _path.0.get("id"))
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::not_found("subsystem id missing"))?;

    let id = SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_subsystems::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("subsystem not found"))?;

    if let Some(name_v) = payload.get("name") {
        existing.name = serde_json::from_value(name_v.clone()).map_err(ApiError::from)?;
    }
    if let Some(owner_v) = payload.get("owner_user_id") {
        let opt_s: Option<String> =
            serde_json::from_value(owner_v.clone()).map_err(ApiError::from)?;
        existing.owner_user_id = if let Some(s) = opt_s {
            Some(
                SqlxUuid::parse_str(&s)
                    .map_err(|_| ApiError::bad_request("invalid owner_user_id"))?,
            )
        } else {
            None
        };
    }

    let affected = db_subsystems::update_by_primary_key(&mut *conn, &id, &existing)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("subsystem not found"));
    }
    Ok(Json(
        serde_json::to_value(&existing).map_err(ApiError::from)?,
    ))
}
