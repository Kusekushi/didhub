use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use sqlx;
use sqlx::types::Uuid as SqlxUuid;

use crate::handlers::utils::parse_positive_usize;
use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystems as db_subsystems;

use super::helpers::{parse_owner_filter, subsystem_to_payload};

pub async fn list(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may list subsystems
    crate::handlers::auth::utils::authenticate_and_require_approved(&_state, &_headers).await?;

    _state
        .audit_request(
            "GET",
            "/subsystems",
            &HashMap::new(),
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let params = _query.map(|q| q.0).unwrap_or_default();
    let page = parse_positive_usize(params.get("page"), 1, "page")?;
    let per_page = parse_positive_usize(params.get("perPage"), 20, "perPage")?;

    let name_filter = params.get("name").map(|s| s.to_lowercase());
    let owner_filter = params
        .get("systemId")
        .or_else(|| params.get("system_id"))
        .or_else(|| params.get("owner_user_id"))
        .map(|s| s.to_string());

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params_uuid: Vec<SqlxUuid> = Vec::new();

    if name_filter.is_some() {
        where_clauses.push("LOWER(name) LIKE ?".to_string());
    }
    if let Some(owner) = parse_owner_filter(owner_filter)? {
        where_clauses.push("owner_user_id = ?".to_string());
        params_uuid.push(owner);
    }

    let where_sql = if where_clauses.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(1) FROM subsystems {where_sql}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for p in &params_uuid {
        count_query = count_query.bind(p);
    }
    if let Some(nf_ref) = name_filter.as_ref() {
        let nf = format!("%{}%", nf_ref);
        count_query = count_query.bind(nf);
    }

    let total: i64 = count_query
        .fetch_one(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let offset = ((page as i64) - 1).saturating_mul(per_page as i64);
    let select_sql = format!(
        "SELECT {} FROM subsystems {} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        db_subsystems::COLUMN_LIST,
        where_sql
    );
    let mut select_query = sqlx::query_as::<_, db_subsystems::SubsystemsRow>(&select_sql);
    for p in &params_uuid {
        select_query = select_query.bind(p);
    }
    if let Some(nf_ref) = name_filter.as_ref() {
        let nf = format!("%{}%", nf_ref);
        select_query = select_query.bind(nf);
    }
    select_query = select_query.bind(per_page as i64).bind(offset as i64);

    let page_items: Vec<db_subsystems::SubsystemsRow> = select_query
        .fetch_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let items: Vec<Value> = page_items.iter().map(subsystem_to_payload).collect();

    Ok(Json(json!({
        "items": items,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
        }
    })))
}
