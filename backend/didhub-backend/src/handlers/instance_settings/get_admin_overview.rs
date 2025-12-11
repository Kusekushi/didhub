use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

pub async fn get_admin_overview(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Count pending system requests
    let pending_system_requests: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pending_system_requests")
            .fetch_one(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    // Count unapproved users (those without 'user' role in roles JSON)
    // Users are approved if their roles array contains 'user'
    let unapproved_users: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE roles NOT LIKE '%\"user\"%'")
            .fetch_one(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    Ok(Json(json!({
        "pendingSystemRequests": pending_system_requests,
        "unapprovedUsers": unapproved_users
    })))
}
