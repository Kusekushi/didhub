use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use sqlx::Acquire;
use uuid::Uuid;

use didhub_db::custom::subsystem_members;
use didhub_db::generated::alters as db_alters;
use didhub_db::generated::subsystems as db_subsystems;

use crate::{error::ApiError, state::AppState};

pub async fn set(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let alter_id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::bad_request("missing alterId"))?;
    let alter_id =
        Uuid::parse_str(alter_id_str).map_err(|_| ApiError::bad_request("invalid alterId"))?;

    let payload = body.as_ref().map(|j| j.0.clone());

    state
        .audit_request(
            "PUT",
            "/alters/{alterId}/subsystem",
            &path,
            &HashMap::new(),
            payload
                .as_ref()
                .map(|v| v as &Value)
                .unwrap_or(&Value::Null),
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let _alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    let mut tx = conn.begin().await.map_err(ApiError::from)?;

    sqlx::query("DELETE FROM subsystem_members WHERE alter_id = ?")
        .bind(alter_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    let has_subsystem = payload
        .as_ref()
        .map(|p| !p.is_null() && !p.get("subsystemId").map(|v| v.is_null()).unwrap_or(false))
        .unwrap_or(false);

    if has_subsystem {
        let subsystem_id_str = payload
            .as_ref()
            .and_then(|p| p.get("subsystemId"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| ApiError::bad_request("missing or invalid subsystemId"))?;
        let subsystem_id = Uuid::parse_str(subsystem_id_str)
            .map_err(|_| ApiError::bad_request("invalid subsystemId format"))?;

        let is_host = payload
            .as_ref()
            .and_then(|p| p.get("isHost"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let _subsystem = db_subsystems::find_by_primary_key(&mut *tx, &subsystem_id)
            .await
            .map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("subsystem not found"))?;

        sqlx::query(
            "INSERT INTO subsystem_members (subsystem_id, alter_id, is_host, added_at) VALUES (?, ?, ?, datetime('now'))"
        )
        .bind(subsystem_id)
        .bind(alter_id)
        .bind(if is_host { 1 } else { 0 })
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

        tx.commit().await.map_err(ApiError::from)?;

        let result = subsystem_members::find_subsystem_for_alter(&mut *conn, &alter_id)
            .await
            .map_err(ApiError::from)?;

        if let Some(subsystem_info) = result {
            Ok(Json(json!({
                "id": subsystem_info.id.to_string(),
                "name": subsystem_info.name,
                "isHost": subsystem_info.is_host != 0,
                "addedAt": subsystem_info.added_at
            })))
        } else {
            Ok(Json(json!(null)))
        }
    } else {
        tx.commit().await.map_err(ApiError::from)?;
        Ok(Json(json!(null)))
    }
}
