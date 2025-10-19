use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::Json;
use didhub_log_client::{ExportOptions, LogCategory, LogEntry};
use serde_json::{json, Value};

use crate::handlers::utils::{audit_entry_to_value, parse_positive_usize};
use crate::{error::ApiError, state::AppState};

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
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

    let params = query.map(|value| value.0).unwrap_or_default();
    let page = parse_positive_usize(params.get("page"), 1, "page")?;
    let per_page = parse_positive_usize(params.get("perPage"), 20, "perPage")?;

    let total_entries = state
        .log_client()
        .status()
        .map_err(ApiError::from)?
        .into_iter()
        .find(|record| record.category == LogCategory::Audit)
        .map(|record| record.entries)
        .unwrap_or(0);

    let limit = page
        .checked_mul(per_page)
        .ok_or_else(|| ApiError::bad_request("pagination parameters too large"))?;

    let mut options = ExportOptions::default().with_category(LogCategory::Audit);
    if limit > 0 {
        options = options.with_limit(limit);
    }

    let entries = state.log_client().export(options).map_err(ApiError::from)?;

    let offset = (page - 1).saturating_mul(per_page);
    let page_entries: Vec<LogEntry> = entries
        .into_iter()
        .rev()
        .skip(offset)
        .take(per_page)
        .collect();

    let items: Vec<Value> = page_entries.into_iter().map(audit_entry_to_value).collect();

    let response = json!({
        "items": items,
        "pagination": {
            "page": page,
            "perPage": per_page,
            "total": total_entries,
        }
    });

    Ok(Json(response))
}
