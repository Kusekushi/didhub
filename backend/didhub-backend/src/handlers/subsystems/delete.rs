use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

pub async fn delete(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _path: Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // Admin-only: accept Authorization header or session cookie
    let auth = match crate::handlers::auth::utils::authenticate_optional(&_state, &_headers).await?
    {
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

    _state
        .audit_request(
            "DELETE",
            "/subsystems/{id}",
            &_path.0,
            &HashMap::new(),
            &Value::Null,
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

    sqlx::query("DELETE FROM subsystem_members WHERE subsystem_id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let affected = db_subsystems::delete_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("subsystem not found"));
    }
    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": true })).map_err(ApiError::from)?,
    ))
}
