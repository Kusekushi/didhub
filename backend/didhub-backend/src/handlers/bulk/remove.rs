use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::types::Uuid as SqlxUuid;

use crate::error::ApiError;
use crate::state::AppState;
use didhub_db::generated::{alters as db_alters, users as db_users};
use didhub_db::generated::{relationships as db_relationships, affiliations as db_affiliations};
use didhub_db::generated::subsystems as db_subsystems;

#[derive(Debug, Deserialize)]
pub struct BulkRemoveRequest {
    #[serde(default)]
    pub alters: Vec<String>,
    #[serde(default)]
    pub users: Vec<String>,
    #[serde(default)]
    pub relationships: Vec<String>,
    #[serde(default)]
    pub affiliations: Vec<String>,
    #[serde(default)]
    pub subsystems: Vec<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct BulkRemoveResponse {
    pub deleted: DeletedCounts,
}

#[derive(Debug, Default, serde::Serialize)]
pub struct DeletedCounts {
    pub alters: i32,
    pub users: i32,
    pub relationships: i32,
    pub affiliations: i32,
    pub subsystems: i32,
}

pub async fn bulk_remove(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: BulkRemoveRequest = serde_json::from_value(payload_value).map_err(ApiError::from)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let mut deleted = DeletedCounts::default();

    if !payload.alters.is_empty() {
        for id_str in &payload.alters {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if db_alters::delete_by_primary_key(&mut *conn, &id).await.is_ok() {
                    deleted.alters += 1;
                }
            }
        }
    }

    if !payload.users.is_empty() {
        for id_str in &payload.users {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if db_users::delete_by_primary_key(&mut *conn, &id).await.is_ok() {
                    deleted.users += 1;
                }
            }
        }
    }

    if !payload.relationships.is_empty() {
        for id_str in &payload.relationships {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if db_relationships::delete_by_primary_key(&mut *conn, &id).await.is_ok() {
                    deleted.relationships += 1;
                }
            }
        }
    }

    if !payload.affiliations.is_empty() {
        for id_str in &payload.affiliations {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if db_affiliations::delete_by_primary_key(&mut *conn, &id).await.is_ok() {
                    deleted.affiliations += 1;
                }
            }
        }
    }

    if !payload.subsystems.is_empty() {
        for id_str in &payload.subsystems {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if db_subsystems::delete_by_primary_key(&mut *conn, &id).await.is_ok() {
                    deleted.subsystems += 1;
                }
            }
        }
    }

    Ok(Json(json!({ "deleted": deleted })))
}
