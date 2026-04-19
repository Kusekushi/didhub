use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::{json, Value};
use uuid::Uuid;

use didhub_db::generated::affiliations as db_affiliations;

use crate::handlers::utils::ensure_system_user;
use crate::{error::ApiError, state::AppState};

pub async fn remove(
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
    let member_id_str = path
        .get("memberId")
        .ok_or_else(|| ApiError::bad_request("missing memberId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;
    let alter_id =
        Uuid::parse_str(member_id_str).map_err(|_| ApiError::bad_request("invalid memberId"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let owner_matches = affiliation
        .owner_user_id
        .map(|owner| owner == user_id)
        .unwrap_or(false);
    crate::handlers::auth::utils::ensure_admin_or(&auth, owner_matches)?;

    if !is_admin {
        ensure_system_user(&mut *conn, user_id, "removing affiliation member").await?;
    }

    let result =
        sqlx::query("DELETE FROM affiliation_members WHERE affiliation_id = ? AND alter_id = ?")
            .bind(affiliation_id)
            .bind(alter_id)
            .execute(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("member not found"));
    }

    Ok(Json(json!({ "deleted": true })))
}
