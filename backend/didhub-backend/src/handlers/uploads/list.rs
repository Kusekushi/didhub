use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::uploads as db_uploads;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    _query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Admin-only: accept Authorization header or session cookie
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &_headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }
    state
        .audit_request(
            "GET",
            "/uploads",
            &HashMap::new(),
            &HashMap::new(),
            &Value::Null,
        )
        .await?;
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let rows = db_uploads::list_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(serde_json::to_value(&rows).map_err(ApiError::from)?))
}
