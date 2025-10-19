use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::affiliations as db_affiliations;
use sqlx::types::Uuid as SqlxUuid;

/// Delete the sigil image for an affiliation
pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::not_found("affiliation id missing"))?
        .to_string();
    let affiliation_id: SqlxUuid = SqlxUuid::parse_str(&affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliation uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if let Some(owner_id) = affiliation.owner_user_id {
        if owner_id != user_id && !is_admin {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    } else if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    let mut updated_affiliation = affiliation;
    updated_affiliation.sigil = None;
    db_affiliations::update_by_primary_key(&mut *conn, &affiliation_id, &updated_affiliation)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
