use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use sqlx::Acquire;
use uuid::Uuid;

use didhub_db::generated::alters as db_alters;
use didhub_db::custom::subsystem_members;

use crate::{error::ApiError, state::AppState};

/// Get the subsystem for a specific alter
pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let alter_id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::bad_request("missing alterId"))?;
    let alter_id =
        Uuid::parse_str(alter_id_str).map_err(|_| ApiError::bad_request("invalid alterId"))?;

    state
        .audit_request(
            "GET",
            "/alters/{alterId}/subsystem",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Verify alter exists
    let _alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    // Query the subsystem_members table to get the subsystem for this alter
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
        // No subsystem found for this alter - return null or empty object
        Ok(Json(json!(null)))
    }
}

/// Set the subsystem for a specific alter
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

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    state
        .audit_request(
            "PUT",
            "/alters/{alterId}/subsystem",
            &path,
            &HashMap::new(),
            &payload,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Verify alter exists
    let _alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    // Extract subsystem ID from the request body
    let subsystem_id_str = payload
        .get("subsystemId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::bad_request("missing or invalid subsystemId"))?;
    let subsystem_id = Uuid::parse_str(subsystem_id_str)
        .map_err(|_| ApiError::bad_request("invalid subsystemId format"))?;

    let is_host = payload
        .get("isHost")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Begin transaction
    let mut tx = conn.begin().await.map_err(ApiError::from)?;

    // Remove existing subsystem membership for this alter (since alter_id is unique)
    sqlx::query("DELETE FROM subsystem_members WHERE alter_id = ?")
        .bind(alter_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    // Add new subsystem membership
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

    // Return the updated subsystem
    get(Extension(state), headers, Path(path)).await
}

/// Remove the subsystem for a specific alter
pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let alter_id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::bad_request("missing alterId"))?;
    let alter_id =
        Uuid::parse_str(alter_id_str).map_err(|_| ApiError::bad_request("invalid alterId"))?;

    state
        .audit_request(
            "DELETE",
            "/alters/{alterId}/subsystem",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Verify alter exists
    let _alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    // Remove subsystem membership for this alter
    sqlx::query("DELETE FROM subsystem_members WHERE alter_id = ?")
        .bind(alter_id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(json!({
        "success": true
    })))
}
