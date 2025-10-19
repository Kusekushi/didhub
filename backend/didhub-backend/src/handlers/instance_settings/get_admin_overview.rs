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

    // Count unapproved users (is_approved = 0)
    let unapproved_users: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE is_approved = 0")
            .fetch_one(&mut *conn)
            .await
            .map_err(ApiError::from)?;

    Ok(Json(json!({
        "pendingSystemRequests": pending_system_requests,
        "unapprovedUsers": unapproved_users
    })))
}
