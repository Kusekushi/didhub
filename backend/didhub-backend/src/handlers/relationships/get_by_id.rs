use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::handlers::relationships::dto::RelationshipResponse;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::relationships as db_rels;

pub async fn get_by_id(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    state
        .audit_request(
            "GET",
            "/relationships/{id}",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;
    let id_str = path
        .get("relationshipId")
        .ok_or_else(|| ApiError::not_found("relationship id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_rels::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => {
            let response: RelationshipResponse = row.into();
            Ok(Json(
                serde_json::to_value(&response).map_err(ApiError::from)?,
            ))
        }
        None => Err(ApiError::not_found("relationship not found")),
    }
}
