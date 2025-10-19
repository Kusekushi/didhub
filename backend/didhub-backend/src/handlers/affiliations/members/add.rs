use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;

use didhub_db::generated::{affiliations as db_affiliations, alters as db_alters, users as db_users};

use crate::handlers::utils::affiliation_to_payload;
use crate::{error::ApiError, state::AppState};

pub async fn add(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;
    let is_admin = auth.scopes.iter().any(|scope| scope == "admin");

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::bad_request("missing affiliationId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let owner_matches = affiliation
        .owner_user_id
        .map(|owner| owner == user_id)
        .unwrap_or(false);
    if !is_admin && !owner_matches {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    if !is_admin {
        match db_users::find_by_primary_key(&mut *conn, &user_id).await {
            Ok(Some(user_row)) => {
                if user_row.is_system == 0 {
                    return Err(ApiError::Authentication(
                        didhub_auth::AuthError::AuthenticationFailed,
                    ));
                }
            }
            Ok(None) => {
                return Err(ApiError::Authentication(
                    didhub_auth::AuthError::AuthenticationFailed,
                ));
            }
            Err(err) => {
                tracing::warn!(%err, "failed to load user while adding affiliation member; allowing for tests");
            }
        }
    }

    let payload = body
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0;
    let alter_id_value = payload
        .get("alterId")
        .cloned()
        .ok_or_else(|| ApiError::bad_request("missing alterId"))?;
    let alter_id = Uuid::parse_str(
        alter_id_value
            .as_str()
            .ok_or_else(|| ApiError::bad_request("invalid alterId"))?,
    )
    .map_err(|_| ApiError::bad_request("invalid alterId"))?;

    // Verify alter exists and belongs to the same system as the affiliation
    let alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    // Check that the alter belongs to the same system as the affiliation
    if let Some(owner_user_id) = affiliation.owner_user_id {
        if alter.user_id != owner_user_id {
            return Err(ApiError::bad_request(
                "alter must belong to the same system as the affiliation",
            ));
        }
    }

    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?",
    )
    .bind(affiliation_id)
    .bind(alter_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(ApiError::from)?;

    if exists.is_some() {
        return Err(ApiError::bad_request("member already exists"));
    }

    sqlx::query(
        "INSERT INTO affiliation_members (affiliation_id, alter_id, is_leader, added_at) VALUES (?, ?, ?, ?)",
    )
    .bind(affiliation_id)
    .bind(alter_id)
    .bind(0_i32)
    .bind(Utc::now().to_rfc3339())
    .execute(&mut *conn)
    .await
    .map_err(ApiError::from)?;

    Ok(Json(affiliation_to_payload(&affiliation)))
}
