use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use uuid::Uuid;

use didhub_db::generated::affiliations as db_affiliations;

use crate::{error::ApiError, state::AppState};

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::bad_request("missing affiliationId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;

    state
        .audit_request(
            "GET",
            "/affiliations/{affiliationId}/members",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Verify affiliation exists
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    // Suppress unused variable warning
    let _ = &affiliation;

    // Query the affiliation_members table
    let members: Vec<(Uuid, i64, String)> = sqlx::query_as(
        "SELECT alter_id, is_leader, added_at FROM affiliation_members WHERE affiliation_id = ?"
    )
        .bind(affiliation_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let result: Vec<Value> = members
        .into_iter()
        .map(|(alter_id, is_leader, added_at)| {
            json!({
                "alterId": alter_id,
                "isLeader": is_leader != 0,
                "addedAt": added_at
            })
        })
        .collect();

    Ok(Json(json!(result)))
}
