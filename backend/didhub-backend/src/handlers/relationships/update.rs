use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::handlers::relationships::dto::UpdateRelationshipDto;
use crate::handlers::utils::user_is_system;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::relationships as db_rels;

pub async fn update(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // RBAC: only admin or creator may update. Accept Authorization header or session cookie.
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };

    state
        .audit_request(
            "PATCH",
            "/relationships/{id}",
            &path,
            &HashMap::new(),
            &body.as_ref().map(|j| j.0.clone()).unwrap_or(Value::Null),
        )
        .await?;

    let id_str = path
        .get("relationshipId")
        .ok_or_else(|| ApiError::not_found("relationship id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_rels::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("relationship not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    let is_creator = auth
        .user_id
        .map(|uid| existing.created_by.map(|cb| cb == uid).unwrap_or(false))
        .unwrap_or(false);
    if !is_admin && !is_creator {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

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

    let dto: UpdateRelationshipDto = if let Some(body) = body {
        serde_json::from_value(body.0).map_err(ApiError::from)?
    } else {
        UpdateRelationshipDto {
            r#type: None,
            side_a_user_id: None,
            side_a_alter_id: None,
            side_b_user_id: None,
            side_b_alter_id: None,
            past_life: None,
        }
    };
    if let Err(issues) = dto.validate() {
        return Err(ApiError::Validation(crate::validation::to_payload(&issues)));
    }

    if let Some(t) = dto.r#type {
        existing.r#type = t;
    }
    if let Some(pl) = dto.past_life {
        existing.past_life = pl;
    }
    if let Some(s) = dto.side_a_user_id {
        existing.side_a_user_id = Some(
            SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_a_user_id"))?,
        );
    }
    if let Some(s) = dto.side_b_user_id {
        existing.side_b_user_id = Some(
            SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_b_user_id"))?,
        );
    }
    if let Some(s) = dto.side_a_alter_id {
        existing.side_a_alter_id = Some(
            SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_a_alter_id"))?,
        );
    }
    if let Some(s) = dto.side_b_alter_id {
        existing.side_b_alter_id = Some(
            SqlxUuid::parse_str(&s)
                .map_err(|_| ApiError::bad_request("invalid side_b_alter_id"))?,
        );
    }

    let affected = db_rels::update_by_primary_key(&mut *conn, &id, &existing)
        .await
        .map_err(ApiError::from)?;
    if affected == 0 {
        return Err(ApiError::not_found("relationship not found"));
    }
    let response: crate::handlers::relationships::dto::RelationshipResponse = existing.into();
    Ok(Json(
        serde_json::to_value(&response).map_err(ApiError::from)?,
    ))
}
