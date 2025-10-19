use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn get(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    state
        .audit_request("GET", "/uploads/{id}", &path, &HashMap::new(), &Value::Null)
        .await?;
    let id_str = path
        .get("uploadId")
        .ok_or_else(|| ApiError::not_found("upload id missing"))?
        .to_string();
    let id: SqlxUuid =
        SqlxUuid::parse_str(&id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_uploads::find_by_primary_key(&mut *conn, &id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => Ok(Json(serde_json::to_value(&row).map_err(ApiError::from)?)),
        None => Err(ApiError::not_found("upload not found")),
    }
}
