use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use uuid::Uuid;

use didhub_db::generated::affiliations as db_affiliations;

use crate::handlers::utils::ensure_system_user;
use crate::{error::ApiError, state::AppState};

pub async fn delete(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = crate::handlers::auth::utils::require_user_id(&auth)?;
    let is_admin = auth.is_admin();

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::bad_request("missing affiliationId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let existing = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let owner_matches = existing
        .owner_user_id
        .map(|owner| owner == user_id)
        .unwrap_or(false);
    crate::handlers::auth::utils::ensure_admin_or(&auth, owner_matches)?;

    if !is_admin {
        ensure_system_user(&mut *conn, user_id, "deleting affiliation").await?;
    }

    sqlx::query("DELETE FROM affiliation_members WHERE affiliation_id = ?")
        .bind(affiliation_id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    db_affiliations::delete_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(json!({ "deleted": true })))
}
