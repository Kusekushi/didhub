use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlterBirthday {
    pub id: String,
    pub name: String,
    pub birthday: Option<String>,
    pub user_id: String,
}

pub async fn list_birthdays(
    Extension(state): Extension<Arc<AppState>>,
    _headers: axum::http::HeaderMap,
) -> Result<Json<Value>, ApiError> {
    // Only approved users (or admin) may access birthdays
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &_headers).await?;

    state
        .audit_request(
            "GET",
            "/alters/birthdays",
            &HashMap::new(),
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Get all alters with birthdays
    let rows: Vec<db_alters::AltersRow> = db_alters::find_with_birthdays_ordered_by_name(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    // Convert rows to simplified birthday objects
    let birthdays: Vec<AlterBirthday> = rows
        .into_iter()
        .map(|row| AlterBirthday {
            id: row.id.to_string(),
            name: row.name,
            birthday: row.birthday,
            user_id: row.user_id.to_string(),
        })
        .collect();

    Ok(Json(
        serde_json::to_value(birthdays).map_err(ApiError::from)?,
    ))
}
