use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use serde_json::Value;

use crate::{error::ApiError, handlers::utils::parse_positive_usize, state::AppState};
use didhub_db::generated::users as db_users;

/// List all users with optional filters and pagination
pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
    _query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;

    let query_params = _query.as_ref().map(|q| &q.0);
    let empty_map = HashMap::new();
    let query_params = query_params.unwrap_or(&empty_map);

    let page = parse_positive_usize(query_params.get("page"), 1, "page")?;
    let per_page = parse_positive_usize(query_params.get("perPage"), 20, "perPage")?;
    let offset = (page - 1) * per_page;

    let search = query_params.get("search").map(|s| s.as_str());
    let username_filter = query_params.get("username").map(|s| s.as_str());
    let is_admin_filter = query_params
        .get("isAdmin")
        .and_then(|s| s.parse::<bool>().ok());
    let is_system_filter = query_params
        .get("isSystem")
        .and_then(|s| s.parse::<bool>().ok());
    let is_approved_filter = query_params
        .get("isApproved")
        .and_then(|s| s.parse::<bool>().ok());

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let mut query = "SELECT id, username, about_me, password_hash, avatar, is_system, is_approved, must_change_password, is_active, email_verified, last_login_at, display_name, created_at, updated_at, is_admin, roles, settings FROM users WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();

    if let Some(search) = search {
        query.push_str(" AND (username LIKE ? OR display_name LIKE ?)");
        let search_pattern = format!("%{}%", search);
        params.push(search_pattern.clone());
        params.push(search_pattern);
    }

    if let Some(username) = username_filter {
        query.push_str(" AND username = ?");
        params.push(username.to_string());
    }

    if let Some(is_admin) = is_admin_filter {
        query.push_str(" AND is_admin = ?");
        params.push(if is_admin { "1" } else { "0" }.to_string());
    }

    if let Some(is_system) = is_system_filter {
        if is_system {
            query.push_str(" AND is_system = ?");
            params.push("1".to_string());
        } else {
            query.push_str(" AND is_system = ?");
            params.push("0".to_string());
        }
    }

    if let Some(is_approved) = is_approved_filter {
        query.push_str(" AND is_approved = ?");
        params.push(if is_approved { "1" } else { "0" }.to_string());
    }

    let count_query = query.replace("SELECT id, username, about_me, password_hash, avatar, is_system, is_approved, must_change_password, is_active, email_verified, last_login_at, display_name, created_at, updated_at, is_admin, roles, settings", "SELECT COUNT(*)");
    let mut count_query_builder = sqlx::query_scalar(&count_query);
    for param in &params {
        count_query_builder = count_query_builder.bind(param);
    }
    let total: i64 = count_query_builder
        .fetch_one(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
    params.push(per_page.to_string());
    params.push(offset.to_string());

    let mut query_builder = sqlx::query_as::<_, db_users::UsersRow>(&query);
    for param in &params {
        query_builder = query_builder.bind(param);
    }
    let rows: Vec<db_users::UsersRow> = query_builder
        .fetch_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let users: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "id": row.id,
                "username": row.username,
                "displayName": row.display_name,
                "isAdmin": row.is_admin != 0,
                "isSystem": row.is_system != 0,
                "isApproved": row.is_approved != 0,
                "createdAt": row.created_at,
                "updatedAt": row.updated_at
            })
        })
        .collect();

    let total_pages = (total as usize).div_ceil(per_page).max(1);

    let response = serde_json::json!({
        "items": users,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": total_pages
        }
    });

    Ok(Json(response))
}
