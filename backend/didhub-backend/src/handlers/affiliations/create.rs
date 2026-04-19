use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use chrono::Utc;
use serde_json::Value;
use uuid::Uuid;

use didhub_db::generated::affiliations as db_affiliations;

use crate::handlers::utils::{affiliation_to_payload, ensure_system_user};
use crate::{error::ApiError, state::AppState};

pub async fn create(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let owner_user_id = crate::handlers::auth::utils::require_user_id(&auth)?;
    let is_admin = auth.is_admin();

    if !is_admin {
        let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
        ensure_system_user(&mut *conn, owner_user_id, "creating affiliation").await?;
    }

    let payload = body
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0;

    let name_value = payload
        .get("name")
        .cloned()
        .ok_or_else(|| ApiError::bad_request("missing name"))?;
    let name: String = serde_json::from_value(name_value).map_err(ApiError::from)?;
    let description = payload
        .get("description")
        .and_then(|value| value.as_str().map(|s| s.to_string()));

    let now = Utc::now().to_rfc3339();
    let new_row = db_affiliations::AffiliationsRow {
        id: Uuid::new_v4(),
        name,
        description,
        sigil: None,
        owner_user_id: Some(owner_user_id),
        created_at: now,
    };

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    db_affiliations::insert_affiliation(&mut *conn, &new_row)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(affiliation_to_payload(&new_row)))
}
