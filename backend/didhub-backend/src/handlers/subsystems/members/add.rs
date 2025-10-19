use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::{alters as db_alters, subsystem_members as db_members, subsystems as db_subsystems};

pub async fn add(
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
            "POST",
            "/subsystems/{id}/members",
            &_path.0,
            &HashMap::new(),
            &payload,
        )
        .await?;

    let alter_id_str: String = serde_json::from_value(
        payload
            .get("alterId")
            .or_else(|| payload.get("alter_id"))
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing alterId"))?,
    )
    .map_err(ApiError::from)?;
    let alter_id = SqlxUuid::parse_str(&alter_id_str)
        .map_err(|_| ApiError::bad_request("invalid alterId"))?;

    let subsystem_id_str = _path
        .0
        .get("subsystemId")
        .or_else(|| _path.0.get("id"))
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::not_found("subsystem id missing"))?;
    let subsystem_id = SqlxUuid::parse_str(&subsystem_id_str)
        .map_err(|_| ApiError::bad_request("invalid subsystem id"))?;

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;

    let subsystem = db_subsystems::find_by_primary_key(&mut *conn, &subsystem_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("subsystem not found"))?;

    let alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    if let Some(owner_user_id) = subsystem.owner_user_id {
        if alter.user_id != owner_user_id {
            return Err(ApiError::bad_request(
                "alter must belong to the same system as the subsystem",
            ));
        }
    }

    let is_host: i32 = payload
        .get("is_host")
        .and_then(|v| v.as_i64())
        .map(|n| n as i32)
        .unwrap_or(0);

    let now = Utc::now().to_rfc3339();
    let new_row = db_members::SubsystemMembersRow {
        subsystem_id,
        alter_id,
        is_host,
        added_at: now,
    };

    db_members::insert_subsystem_member(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(&new_row).map_err(ApiError::from)?,
    ))
}
