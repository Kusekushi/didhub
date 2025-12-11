use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Query};
use serde_json::Value;

use crate::{error::ApiError, handlers::utils::parse_positive_usize, state::AppState};
use didhub_db::generated::users as db_users;

/// Helper to check if a user has a specific role
fn user_has_role(roles_json: &str, role: &str) -> bool {
    serde_json::from_str::<Vec<String>>(roles_json)
        .map(|roles| roles.iter().any(|r| r == role))
        .unwrap_or(false)
}

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
    // Role-based filters (derived from roles JSON)
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

    let mut query = "SELECT id, username, about_me, password_hash, avatar, must_change_password, last_login_at, display_name, created_at, updated_at, roles, settings FROM users WHERE 1=1".to_string();
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

    // Role-based filters use LIKE on the roles JSON column
    if let Some(is_admin) = is_admin_filter {
        if is_admin {
            query.push_str(" AND roles LIKE '%\"admin\"%'");
        } else {
            query.push_str(" AND roles NOT LIKE '%\"admin\"%'");
        }
    }

    if let Some(is_system) = is_system_filter {
        if is_system {
            query.push_str(" AND roles LIKE '%\"system\"%'");
        } else {
            query.push_str(" AND roles NOT LIKE '%\"system\"%'");
        }
    }

    if let Some(is_approved) = is_approved_filter {
        if is_approved {
            query.push_str(" AND roles LIKE '%\"user\"%'");
        } else {
            query.push_str(" AND roles NOT LIKE '%\"user\"%'");
        }
    }

    let count_query = query.replace("SELECT id, username, about_me, password_hash, avatar, must_change_password, last_login_at, display_name, created_at, updated_at, roles, settings", "SELECT COUNT(*)");
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
            let is_admin = user_has_role(&row.roles, "admin");
            let is_system = user_has_role(&row.roles, "system");
            let is_approved = user_has_role(&row.roles, "user");
            serde_json::json!({
                "id": row.id,
                "username": row.username,
                "displayName": row.display_name,
                "isAdmin": is_admin,
                "isSystem": is_system,
                "isApproved": is_approved,
                "roles": serde_json::from_str::<Vec<String>>(&row.roles).unwrap_or_default(),
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
