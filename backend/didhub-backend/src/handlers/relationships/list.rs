use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use serde_json::Value;

use crate::handlers::relationships::dto::RelationshipResponse;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::relationships as db_rels;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    _query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may list relationships
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;
    state
        .audit_request(
            "GET",
            "/relationships",
            &HashMap::new(),
            &HashMap::new(),
            &Value::Null,
        )
        .await?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let rows = db_rels::list_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    let responses: Vec<RelationshipResponse> = rows.into_iter().map(Into::into).collect();
    Ok(Json(
        serde_json::to_value(&responses).map_err(ApiError::from)?,
    ))
}
