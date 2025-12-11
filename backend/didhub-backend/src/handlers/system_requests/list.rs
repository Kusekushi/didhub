use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::pending_system_requests as db_requests;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Admin only
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }
    let query_params = query
        .as_ref()
        .map(|value| value.0.clone())
        .unwrap_or_default();

    // Parse pagination parameters
    let page = query_params
        .get("page")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(1)
        .max(1);
    let per_page = query_params
        .get("perPage")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(20)
        .clamp(1, 100);
    let offset = (page - 1) * per_page;

    // Parse status filter
    let _status_filter = query_params.get("status");

    state
        .audit_request(
            "GET",
            "/system-requests",
            &HashMap::new(),
            &query_params,
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Get total count for pagination
    let count_query = "SELECT COUNT(*) FROM pending_system_requests";
    let total: i64 = sqlx::query_scalar(count_query)
        .fetch_one(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    // Get paginated results
    let rows = db_requests::list_paginated_ordered_by_created_at_desc(
        &mut *conn,
        per_page as i64,
        offset as i64,
    )
    .await
    .map_err(ApiError::from)?;

    // Transform to API format - all pending requests have status "pending"
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "id": row.id,
                "userId": row.user_id,
                "message": row.note,
                "status": "pending",
                "createdAt": row.created_at
            })
        })
        .collect();

    let total_pages = (total as usize).div_ceil(per_page).max(1);

    let response = serde_json::json!({
        "items": items,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": total_pages
        }
    });

    Ok(Json(response))
}
