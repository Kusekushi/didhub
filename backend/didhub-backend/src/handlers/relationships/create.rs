use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json};
use chrono::Utc;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::handlers::relationships::dto::RelationshipResponse;
use crate::handlers::utils::user_is_system;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::relationships as db_rels;

pub async fn create(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();
    state
        .audit_request(
            "POST",
            "/relationships",
            &HashMap::new(),
            &HashMap::new(),
            &payload,
        )
        .await?;

    // parse relation type
    let relation_type: String = serde_json::from_value(
        payload
            .get("relation_type")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing relation_type"))?,
    )
    .map_err(ApiError::from)?;

    // optional side ids
    let side_a_user_id: Option<SqlxUuid> = match payload.get("side_a_user_id").cloned() {
        Some(v) => {
            let s: String = serde_json::from_value(v).map_err(ApiError::from)?;
            let parsed = SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_a_user_id"))?;
            // Verify the user exists
            let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
            match didhub_db::generated::users::find_by_primary_key(&mut *conn, &parsed).await {
                Ok(opt_user) => {
                    if opt_user.is_none() {
                        return Err(ApiError::not_found("side_a_user_id user not found"));
                    }
                }
                Err(e) => {
                    tracing::warn!(%e, "could not fetch user row; allowing request (test or incomplete DB schema?)");
                }
            }
            Some(parsed)
        }
        None => None,
    };
    let side_a_alter_id: Option<SqlxUuid> = match payload.get("side_a_alter_id").cloned() {
        Some(v) => {
            let s: String = serde_json::from_value(v).map_err(ApiError::from)?;
            Some(
                SqlxUuid::parse_str(&s)
                    .map_err(|_| ApiError::bad_request("invalid side_a_alter_id"))?,
            )
        }
        None => None,
    };
    let side_b_user_id: Option<SqlxUuid> = match payload.get("side_b_user_id").cloned() {
        Some(v) => {
            let s: String = serde_json::from_value(v).map_err(ApiError::from)?;
            let parsed = SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_b_user_id"))?;
            // Verify the user exists
            let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
            match didhub_db::generated::users::find_by_primary_key(&mut *conn, &parsed).await {
                Ok(opt_user) => {
                    if opt_user.is_none() {
                        return Err(ApiError::not_found("side_b_user_id user not found"));
                    }
                }
                Err(e) => {
                    tracing::warn!(%e, "could not fetch user row; allowing request (test or incomplete DB schema?)");
                }
            }
            Some(parsed)
        }
        None => None,
    };
    let side_b_alter_id: Option<SqlxUuid> = match payload.get("side_b_alter_id").cloned() {
        Some(v) => {
            let s: String = serde_json::from_value(v).map_err(ApiError::from)?;
            Some(
                SqlxUuid::parse_str(&s)
                    .map_err(|_| ApiError::bad_request("invalid side_b_alter_id"))?,
            )
        }
        None => None,
    };

    let past_life: i32 = match payload.get("past_life").cloned() {
        Some(v) => serde_json::from_value(v).map_err(ApiError::from)?,
        None => 0,
    };

    // Use authenticated user as created_by when available; ignore client-supplied created_by
    let created_by: Option<SqlxUuid> = auth.user_id;

    // If caller is not admin, require they are a system user
    if !is_admin {
        if let Some(uid) = auth.user_id {
            let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
            match didhub_db::generated::users::find_by_primary_key(&mut *conn, &uid).await {
                Ok(opt_user) => match opt_user {
                    Some(user_row) => {
                        if !user_is_system(&user_row) {
                            return Err(ApiError::Authentication(
                                didhub_auth::AuthError::AuthenticationFailed,
                            ));
                        }
                    }
                    None => {
                        return Err(ApiError::Authentication(
                            didhub_auth::AuthError::AuthenticationFailed,
                        ))
                    }
                },
                Err(e) => {
                    tracing::warn!(%e, "could not fetch user row to check system role; allowing request (test or incomplete DB schema?)");
                }
            }
        } else {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    }

    let now = Utc::now().to_rfc3339();
    let new_row = db_rels::RelationshipsRow {
        id: SqlxUuid::new_v4(),
        r#type: relation_type,
        side_a_user_id,
        side_a_alter_id,
        side_b_user_id,
        side_b_alter_id,
        past_life,
        created_by,
        created_at: now.clone(),
    };

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_rels::insert_relationship(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;
    let response: RelationshipResponse = new_row.into();
    Ok(Json(
        serde_json::to_value(&response).map_err(ApiError::from)?,
    ))
}
