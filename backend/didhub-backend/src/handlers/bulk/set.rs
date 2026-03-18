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
pub struct BulkSetRequest {
    #[serde(default)]
    pub alters: Vec<serde_json::Value>,
    #[serde(default)]
    pub users: Vec<serde_json::Value>,
    #[serde(default)]
    pub relationships: Vec<serde_json::Value>,
    #[serde(default)]
    pub affiliations: Vec<serde_json::Value>,
    #[serde(default)]
    pub subsystems: Vec<serde_json::Value>,
}

pub async fn bulk_set(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: BulkSetRequest = serde_json::from_value(payload_value).map_err(ApiError::from)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let mut response = json!({});

    if !payload.alters.is_empty() {
        let mut alters = Vec::new();
        for alter_data in &payload.alters {
            if let Some(id) = alter_data.get("id").and_then(|v| v.as_str()) {
                if let Ok(uuid) = SqlxUuid::parse_str(id) {
                    if let Ok(Some(row)) = db_alters::find_by_primary_key(&mut *conn, &uuid).await {
                        alters.push(serde_json::to_value(&row).unwrap_or(json!({})));
                    }
                }
            }
        }
        response.as_object_mut().unwrap().insert("alters".to_string(), json!(alters));
    }

    if !payload.users.is_empty() {
        let mut users = Vec::new();
        for user_data in &payload.users {
            if let Some(id) = user_data.get("id").and_then(|v| v.as_str()) {
                if let Ok(uuid) = SqlxUuid::parse_str(id) {
                    if let Ok(Some(row)) = db_users::find_by_primary_key(&mut *conn, &uuid).await {
                        let v = serde_json::to_value(&crate::handlers::users::dto::UserPublic::from(row))
                            .unwrap_or(json!({}));
                        users.push(v);
                    }
                }
            }
        }
        response.as_object_mut().unwrap().insert("users".to_string(), json!(users));
    }

    if !payload.relationships.is_empty() {
        let mut relationships = Vec::new();
        for rel_data in &payload.relationships {
            if let Some(id) = rel_data.get("id").and_then(|v| v.as_str()) {
                if let Ok(uuid) = SqlxUuid::parse_str(id) {
                    if let Ok(Some(row)) = db_relationships::find_by_primary_key(&mut *conn, &uuid).await {
                        relationships.push(serde_json::to_value(&row).unwrap_or(json!({})));
                    }
                }
            }
        }
        response.as_object_mut().unwrap().insert("relationships".to_string(), json!(relationships));
    }

    if !payload.affiliations.is_empty() {
        let mut affiliations = Vec::new();
        for aff_data in &payload.affiliations {
            if let Some(id) = aff_data.get("id").and_then(|v| v.as_str()) {
                if let Ok(uuid) = SqlxUuid::parse_str(id) {
                    if let Ok(Some(row)) = db_affiliations::find_by_primary_key(&mut *conn, &uuid).await {
                        affiliations.push(serde_json::to_value(&row).unwrap_or(json!({})));
                    }
                }
            }
        }
        response.as_object_mut().unwrap().insert("affiliations".to_string(), json!(affiliations));
    }

    if !payload.subsystems.is_empty() {
        let mut subsystems = Vec::new();
        for sub_data in &payload.subsystems {
            if let Some(id) = sub_data.get("id").and_then(|v| v.as_str()) {
                if let Ok(uuid) = SqlxUuid::parse_str(id) {
                    if let Ok(Some(row)) = db_subsystems::find_by_primary_key(&mut *conn, &uuid).await {
                        subsystems.push(serde_json::to_value(&row).unwrap_or(json!({})));
                    }
                }
            }
        }
        response.as_object_mut().unwrap().insert("subsystems".to_string(), json!(subsystems));
    }

    Ok(Json(response))
}
