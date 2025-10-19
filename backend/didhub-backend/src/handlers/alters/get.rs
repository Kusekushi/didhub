use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::handlers::utils::parse_json_array_fields;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may get alters
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    state
        .audit_request("GET", "/alters/{id}", &path, &HashMap::new(), &Value::Null)
        .await?;
    let id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::not_found("alter id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_alters::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => {
            let mut v = serde_json::to_value(&row).map_err(ApiError::from)?;
            if let Some(obj) = v.as_object_mut() {
                // Parse JSON array fields
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
            Ok(Json(v))
        }
        None => Err(ApiError::not_found("alter not found")),
    }
}
