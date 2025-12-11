use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::Value;
use uuid::Uuid;

use didhub_db::generated::{affiliations as db_affiliations, users as db_users};

use crate::handlers::utils::{affiliation_to_payload, user_is_system};
use crate::{error::ApiError, state::AppState};

pub async fn update(
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
    let mut existing = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let owner_matches = existing
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
                if !user_is_system(&user_row) {
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
                tracing::warn!(%err, "failed to load user while updating affiliation; allowing for tests");
            }
        }
    }

    let payload = body
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0;

    let mut updated = false;
    if let Some(name_value) = payload.get("name") {
        let name: String = serde_json::from_value(name_value.clone()).map_err(ApiError::from)?;
        existing.name = name;
        updated = true;
    }

    if let Some(desc_value) = payload.get("description") {
        let desc: Option<String> = if desc_value.is_null() {
            None
        } else {
            Some(serde_json::from_value(desc_value.clone()).map_err(ApiError::from)?)
        };
        existing.description = desc;
        updated = true;
    }

    if !updated {
        return Err(ApiError::bad_request("no fields to update"));
    }

    db_affiliations::update_by_primary_key(&mut *conn, &affiliation_id, &existing)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(affiliation_to_payload(&existing)))
}
