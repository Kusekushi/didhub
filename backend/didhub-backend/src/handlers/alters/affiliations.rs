use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use sqlx::Acquire;
use uuid::Uuid;

use didhub_db::generated::alters as db_alters;

use crate::{error::ApiError, state::AppState};

/// Get all affiliations for a specific alter
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
            "/alters/{alterId}/affiliations",
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

    // Query the affiliation_members table to get all affiliations for this alter
    let rows: Vec<(Uuid, String, Option<String>, Option<String>, i64, String)> = sqlx::query_as(
        r#"
        SELECT a.id, a.name, a.description, a.sigil, am.is_leader, am.added_at
        FROM affiliations a
        INNER JOIN affiliation_members am ON a.id = am.affiliation_id
        WHERE am.alter_id = ?
        ORDER BY a.name
        "#,
    )
    .bind(alter_id)
    .fetch_all(&mut *conn)
    .await
    .map_err(ApiError::from)?;

    let affiliations: Vec<Value> = rows
        .into_iter()
        .map(|(id, name, description, sigil, is_leader, added_at)| {
            json!({
                "id": id.to_string(),
                "name": name,
                "description": description,
                "sigil": sigil,
                "isLeader": is_leader != 0,
                "addedAt": added_at
            })
        })
        .collect();

    Ok(Json(json!({
        "data": affiliations,
        "total": affiliations.len()
    })))
}

/// Set affiliations for a specific alter (replaces existing affiliations)
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
            "/alters/{alterId}/affiliations",
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

    // Extract affiliation IDs from the request body
    let affiliation_ids: Vec<Uuid> = payload
        .get("affiliationIds")
        .and_then(|v| v.as_array())
        .ok_or_else(|| ApiError::bad_request("missing or invalid affiliationIds array"))?
        .iter()
        .map(|v| {
            v.as_str()
                .ok_or_else(|| ApiError::bad_request("affiliationId must be a string"))
                .and_then(|s| {
                    Uuid::parse_str(s)
                        .map_err(|_| ApiError::bad_request("invalid affiliationId format"))
                })
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Begin transaction
    let mut tx = conn.begin().await.map_err(ApiError::from)?;

    // Remove all existing affiliations for this alter
    sqlx::query("DELETE FROM affiliation_members WHERE alter_id = ?")
        .bind(alter_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;

    // Add new affiliations
    for affiliation_id in &affiliation_ids {
        sqlx::query(
            "INSERT INTO affiliation_members (affiliation_id, alter_id, is_leader, added_at) VALUES (?, ?, 0, datetime('now'))"
        )
        .bind(affiliation_id)
        .bind(alter_id)
        .execute(&mut *tx)
        .await
        .map_err(ApiError::from)?;
    }

    tx.commit().await.map_err(ApiError::from)?;

    // Return the updated affiliations
    get(Extension(state), headers, Path(path)).await
}
