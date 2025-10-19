use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use serde_json::Value;

use crate::{error::ApiError, handlers::utils::parse_json_array_fields, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may list alters
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;
    
    let params = query.map(|q| q.0).unwrap_or_default();
    
    state
        .audit_request(
            "GET",
            "/alters",
            &HashMap::new(),
            &params,
            &Value::Null,
        )
        .await?;
    
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    
    // Check for systemId filter (maps to user_id in the database)
    let system_id_filter = params
        .get("systemId")
        .or_else(|| params.get("system_id"))
        .or_else(|| params.get("userId"))
        .or_else(|| params.get("user_id"));
    
    let rows: Vec<db_alters::AltersRow> = if let Some(system_id_str) = system_id_filter {
        let system_id = SqlxUuid::parse_str(system_id_str)
            .map_err(|_| ApiError::bad_request("invalid systemId"))?;
        sqlx::query_as::<_, db_alters::AltersRow>(
            "SELECT id, user_id, name, description, age, gender, pronouns, birthday, sexuality, species, alter_type, job, weapon, triggers, metadata, soul_songs, interests, notes, images, system_roles, is_system_host, is_dormant, is_merged, owner_user_id, created_at FROM alters WHERE user_id = ? ORDER BY name"
        )
        .bind(system_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(ApiError::from)?
    } else {
        db_alters::list_all(&mut *conn)
            .await
            .map_err(ApiError::from)?
    };
    
    // Convert rows to JSON and inject primaryUploadId from the images field if present
    let mut values = Vec::with_capacity(rows.len());
    for row in rows.into_iter() {
        let mut v = serde_json::to_value(&row).map_err(ApiError::from)?;
        if let Some(obj) = v.as_object_mut() {
            parse_json_array_fields(obj, &row);
            // Map user_id to systemId for frontend compatibility
            if let Some(user_id) = obj.get("user_id").cloned() {
                obj.insert("systemId".to_string(), user_id);
            }
            // Extract primaryUploadId from images
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
        values.push(v);
    }
    Ok(Json(serde_json::Value::Array(values)))
}
