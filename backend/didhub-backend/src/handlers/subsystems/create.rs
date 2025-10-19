use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

pub async fn create(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
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
            "/subsystems",
            &HashMap::new(),
            &HashMap::new(),
            &payload,
        )
        .await?;

    let name: String = serde_json::from_value(
        payload
            .get("name")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing name"))?,
    )
    .map_err(ApiError::from)?;

    let owner_user_id: Option<SqlxUuid> = if let Some(owner_val) = payload
        .get("owner_user_id")
        .or_else(|| payload.get("systemId"))
    {
        let s: String = serde_json::from_value(owner_val.clone()).map_err(ApiError::from)?;
        Some(SqlxUuid::parse_str(&s).map_err(|_| ApiError::bad_request("invalid owner_user_id or systemId"))?)
    } else {
        None
    };

    let now = Utc::now().to_rfc3339();
    let new_row = db_subsystems::SubsystemsRow {
        id: SqlxUuid::new_v4(),
        name,
        owner_user_id,
        created_at: now.clone(),
    };

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_subsystems::insert_subsystem(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(&new_row).map_err(ApiError::from)?,
    ))
}
