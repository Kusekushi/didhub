use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use uuid::Uuid;

use didhub_db::generated::affiliations as db_affiliations;

use crate::{error::ApiError, state::AppState};

pub async fn update(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Only affiliation owner or admin can update member status
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");

    state
        .audit_request(
            "PATCH",
            "/affiliations/{affiliationId}/members/{memberId}",
            &path,
            &HashMap::new(),
            &body.as_ref().map(|b| b.0.clone()).unwrap_or(Value::Null),
        )
        .await?;

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::bad_request("missing affiliationId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;

    let member_id_str = path
        .get("memberId")
        .ok_or_else(|| ApiError::bad_request("missing memberId"))?;
    let member_id =
        Uuid::parse_str(member_id_str).map_err(|_| ApiError::bad_request("invalid memberId"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Verify affiliation exists and check ownership
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    // Only owner or admin can update members
    if !is_admin && affiliation.owner_user_id != Some(user_id) {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    // Get the payload
    let payload = body.as_ref().map(|b| b.0.clone()).unwrap_or(Value::Null);

    // Update isLeader if provided
    if let Some(is_leader) = payload.get("isLeader").and_then(|v| v.as_bool()) {
        let is_leader_val: i32 = if is_leader { 1 } else { 0 };
        sqlx::query("UPDATE affiliation_members SET is_leader = ? WHERE affiliation_id = ? AND alter_id = ?")
            .bind(is_leader_val)
            .bind(affiliation_id)
            .bind(member_id)
            .execute(&mut *conn)
            .await
            .map_err(ApiError::from)?;
    }

    // Fetch and return the updated member
    let member: Option<(Uuid, i64, String)> = sqlx::query_as(
        "SELECT alter_id, is_leader, added_at FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?"
    )
        .bind(affiliation_id)
        .bind(member_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    match member {
        Some((alter_id, is_leader, added_at)) => Ok(Json(json!({
            "alterId": alter_id,
            "isLeader": is_leader != 0,
            "addedAt": added_at
        }))),
        None => Err(ApiError::not_found("member not found")),
    }
}
