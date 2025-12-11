use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use axum::http::HeaderMap;
use serde_json::Value;
use uuid::Uuid;

use crate::handlers::utils::affiliation_to_payload;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::affiliations as db_affiliations;

pub async fn get(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _path: Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may get affiliation
    crate::handlers::auth::utils::authenticate_and_require_approved(&_state, &_headers).await?;

    _state
        .audit_request(
            "GET",
            "/affiliations/{affiliationId}",
            &_path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let affiliation_id_str = _path
        .get("affiliationId")
        .ok_or_else(|| ApiError::bad_request("missing affiliationId"))?;
    let affiliation_id = Uuid::parse_str(affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliationId"))?;

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;
    let opt = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?;
    match opt {
        Some(row) => Ok(Json(affiliation_to_payload(&row))),
        None => Err(ApiError::not_found("affiliation not found")),
    }
}
