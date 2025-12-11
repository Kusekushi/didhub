use crate::{
    error::ApiError,
    handlers::utils::{affiliation_to_payload, parse_positive_usize},
    state::AppState,
};
use axum::extract::Query as AxumQuery;
use axum::http::HeaderMap;
use axum::{Extension, Json};
use didhub_db::generated::affiliations as db_affiliations;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub async fn list(
    Extension(_state): Extension<Arc<AppState>>,
    _headers: HeaderMap,
    _query: Option<AxumQuery<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may list affiliations
    crate::handlers::auth::utils::authenticate_and_require_approved(&_state, &_headers).await?;

    let params = _query.map(|v| v.0).unwrap_or_default();
    let page = parse_positive_usize(params.get("page"), 1, "page")?;
    let per_page = parse_positive_usize(params.get("perPage"), 20, "perPage")?;

    // audit the request
    _state
        .audit_request(
            "GET",
            "/affiliations",
            &HashMap::new(),
            &params,
            &Value::Null,
        )
        .await?;

    let search_opt = params.get("search").and_then(|s| {
        if s.is_empty() {
            None
        } else {
            Some(s.to_lowercase())
        }
    });

    // Check for systemId filter (maps to owner_user_id in the database)
    let system_id_filter = params
        .get("systemId")
        .or_else(|| params.get("system_id"))
        .or_else(|| params.get("owner_user_id"));

    let parsed_system_id: Option<Uuid> = if let Some(sid) = system_id_filter {
        Some(Uuid::parse_str(sid).map_err(|_| ApiError::bad_request("invalid systemId"))?)
    } else {
        None
    };

    let mut conn = _state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Build WHERE clause conditions
    let mut where_conditions: Vec<String> = Vec::new();

    if search_opt.is_some() {
        where_conditions.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)".to_string());
    }
    if parsed_system_id.is_some() {
        where_conditions.push("owner_user_id = ?".to_string());
    }

    let where_clause = if where_conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_conditions.join(" AND "))
    };

    // Build count query
    let count_sql = format!("SELECT COUNT(*) FROM affiliations {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);

    // Bind parameters in order
    if let Some(search) = &search_opt {
        let like = format!("%{}%", search);
        count_query = count_query.bind(like.clone()).bind(like);
    }
    if let Some(sid) = &parsed_system_id {
        count_query = count_query.bind(*sid);
    }

    let total: i64 = count_query
        .fetch_one(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let offset = (page.saturating_sub(1)).saturating_mul(per_page);

    // Build data query
    let data_sql = format!(
        "SELECT id, name, description, sigil, owner_user_id, created_at FROM affiliations {} ORDER BY name LIMIT ? OFFSET ?",
        where_clause
    );
    let mut data_query = sqlx::query_as::<_, db_affiliations::AffiliationsRow>(&data_sql);

    // Bind parameters in order
    if let Some(search) = &search_opt {
        let like = format!("%{}%", search);
        data_query = data_query.bind(like.clone()).bind(like);
    }
    if let Some(sid) = &parsed_system_id {
        data_query = data_query.bind(*sid);
    }
    data_query = data_query.bind(per_page as i64).bind(offset as i64);

    let rows: Vec<db_affiliations::AffiliationsRow> = data_query
        .fetch_all(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    let items: Vec<Value> = rows.iter().map(affiliation_to_payload).collect();

    let response = json!({
        "items": items,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total,
        }
    });

    Ok(Json(response))
}
