use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};

pub async fn remove(
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
            "/subsystems/{subsystemId}/members/{memberId}",
            &_path.0,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let subsystem_id_str = _path
        .0
        .get("subsystemId")
        .or_else(|| _path.0.get("id"))
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::not_found("subsystem id missing"))?;
    let subsystem_id = SqlxUuid::parse_str(&subsystem_id_str)
        .map_err(|_| ApiError::bad_request("invalid subsystem id"))?;

    let alter_id_str = _path
        .0
        .get("memberId")
        .or_else(|| _path.0.get("alterId"))
        .or_else(|| _path.0.get("alter_id"))
        .map(|s| s.to_string())
        .ok_or_else(|| ApiError::not_found("member id missing"))?;
    let alter_id = SqlxUuid::parse_str(&alter_id_str)
        .map_err(|_| ApiError::bad_request("invalid member id"))?;

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;
    let res = sqlx::query("DELETE FROM subsystem_members WHERE subsystem_id = ? AND alter_id = ?")
        .bind(subsystem_id)
        .bind(alter_id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(
        serde_json::to_value(serde_json::json!({ "deleted": res.rows_affected() > 0 }))
            .map_err(ApiError::from)?,
    ))
}
