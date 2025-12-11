use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

pub async fn update(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Only system owner or admin can update member status
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");

    state
        .audit_request(
            "PATCH",
            "/subsystems/{subsystemId}/members/{memberId}",
            &path,
            &HashMap::new(),
            &body.as_ref().map(|b| b.0.clone()).unwrap_or(Value::Null),
        )
        .await?;

    let subsystem_id_str = path
        .get("subsystemId")
        .ok_or_else(|| ApiError::bad_request("missing subsystemId"))?;
    let subsystem_id = Uuid::parse_str(subsystem_id_str)
        .map_err(|_| ApiError::bad_request("invalid subsystemId"))?;

    let member_id_str = path
        .get("memberId")
        .ok_or_else(|| ApiError::bad_request("missing memberId"))?;
    let member_id =
        Uuid::parse_str(member_id_str).map_err(|_| ApiError::bad_request("invalid memberId"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let subsystem = db_subsystems::find_by_primary_key(&mut *conn, &subsystem_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("subsystem not found"))?;

    if !is_admin {
        if let Some(owner_id) = subsystem.owner_user_id {
            if owner_id != user_id {
                return Err(ApiError::Authentication(
                    didhub_auth::AuthError::AuthenticationFailed,
                ));
            }
        }
    }

    let payload = body.as_ref().map(|b| b.0.clone()).unwrap_or(Value::Null);

    if let Some(is_host) = payload.get("isHost").and_then(|v| v.as_bool()) {
        let is_host_val: i32 = if is_host { 1 } else { 0 };
        sqlx::query(
            "UPDATE subsystem_members SET is_host = ? WHERE subsystem_id = ? AND alter_id = ?",
        )
        .bind(is_host_val)
        .bind(subsystem_id)
        .bind(member_id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    }

    let member: Option<(Uuid, i64, String)> = sqlx::query_as(
        "SELECT alter_id, is_host, added_at FROM subsystem_members WHERE subsystem_id = ? AND alter_id = ?"
    )
        .bind(subsystem_id)
        .bind(member_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    match member {
        Some((alter_id, is_host, added_at)) => Ok(Json(json!({
            "alterId": alter_id,
            "isHost": is_host != 0,
            "addedAt": added_at
        }))),
        None => Err(ApiError::not_found("member not found")),
    }
}
