use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use didhub_log_client::LogCategory;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

pub async fn clear(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    // Admin-only: accept Authorization header or session cookie
    let auth = match crate::handlers::auth::utils::authenticate_optional(&state, &headers).await? {
        Some(a) => a,
        None => {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ))
        }
    };
    let is_admin = auth.scopes.iter().any(|scope| scope == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    state
        .log_client()
        .delete(Some(LogCategory::Audit))
        .map_err(ApiError::from)?;

    Ok(Json(json!({ "cleared": true })))
}
