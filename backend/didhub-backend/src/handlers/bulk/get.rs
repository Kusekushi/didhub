use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::types::Uuid as SqlxUuid;

use crate::handlers::utils::parse_json_array_fields;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::{alters as db_alters, users as db_users};
use didhub_db::generated::{relationships as db_relationships, affiliations as db_affiliations};
use didhub_db::generated::{subsystems as db_subsystems};

#[derive(Debug, Deserialize)]
pub struct BulkGetRequest {
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

pub async fn bulk_get(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may use bulk get
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let payload_value = body
        .map(|json| json.0)
        .ok_or_else(|| ApiError::bad_request("missing request body"))?;
    let payload: BulkGetRequest = serde_json::from_value(payload_value).map_err(ApiError::from)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let mut response = json!({});

    // Bulk get alters
    if !payload.alters.is_empty() {
        let mut alters = Vec::new();
        for id_str in &payload.alters {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if let Ok(Some(row)) = db_alters::find_by_primary_key(&mut *conn, &id).await {
                    let mut v = serde_json::to_value(&row).map_err(ApiError::from)?;
                    if let Some(obj) = v.as_object_mut() {
                        parse_json_array_fields(obj, &row);
                        if let Some(user_id) = obj.get("user_id").cloned() {
                            obj.insert("systemId".to_string(), user_id);
                        }
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&row.images) {
                            if let Some(arr) = parsed.as_array() {
                                if let Some(first) = arr.first() {
                                    if let Some(s) = first.as_str() {
                                        obj.insert(
                                            "primaryUploadId".to_string(),
                                            serde_json::Value::String(s.to_string()),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    alters.push(v);
                }
            }
        }
        response.as_object_mut().unwrap().insert("alters".to_string(), json!(alters));
    }

    // Bulk get users
    if !payload.users.is_empty() {
        let mut users = Vec::new();
        for id_str in &payload.users {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if let Ok(Some(row)) = db_users::find_by_primary_key(&mut *conn, &id).await {
                    let v = serde_json::to_value(&crate::handlers::users::dto::UserPublic::from(row))
                        .map_err(ApiError::from)?;
                    users.push(v);
                }
            }
        }
        response.as_object_mut().unwrap().insert("users".to_string(), json!(users));
    }

    // Bulk get relationships
    if !payload.relationships.is_empty() {
        let mut relationships = Vec::new();
        for id_str in &payload.relationships {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if let Ok(Some(row)) = db_relationships::find_by_primary_key(&mut *conn, &id).await {
                    let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                    relationships.push(v);
                }
            }
        }
        response.as_object_mut().unwrap().insert("relationships".to_string(), json!(relationships));
    }

    // Bulk get affiliations
    if !payload.affiliations.is_empty() {
        let mut affiliations = Vec::new();
        for id_str in &payload.affiliations {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if let Ok(Some(row)) = db_affiliations::find_by_primary_key(&mut *conn, &id).await {
                    let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                    affiliations.push(v);
                }
            }
        }
        response.as_object_mut().unwrap().insert("affiliations".to_string(), json!(affiliations));
    }

    // Bulk get subsystems
    if !payload.subsystems.is_empty() {
        let mut subsystems = Vec::new();
        for id_str in &payload.subsystems {
            if let Ok(id) = SqlxUuid::parse_str(id_str) {
                if let Ok(Some(row)) = db_subsystems::find_by_primary_key(&mut *conn, &id).await {
                    let v = serde_json::to_value(&row).map_err(ApiError::from)?;
                    subsystems.push(v);
                }
            }
        }
        response.as_object_mut().unwrap().insert("subsystems".to_string(), json!(subsystems));
    }

    Ok(Json(response))
}
