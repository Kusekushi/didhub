use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Path};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::subsystem_members as db_subsystem_members;
use didhub_db::generated::subsystems as db_subsystems;

pub async fn list(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let subsystem_id_str = path
        .get("subsystemId")
        .ok_or_else(|| ApiError::bad_request("missing subsystemId"))?;
    let subsystem_id = Uuid::parse_str(subsystem_id_str)
        .map_err(|_| ApiError::bad_request("invalid subsystemId"))?;

    state
        .audit_request(
            "GET",
            "/subsystems/{subsystemId}/members",
            &path,
            &HashMap::new(),
            &Value::Null,
        )
        .await?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    let subsystem = db_subsystems::find_by_primary_key(&mut *conn, &subsystem_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("subsystem not found"))?;

    let _ = &subsystem;

    let members = db_subsystem_members::find_by_subsystem_id(&mut *conn, &subsystem_id)
        .await
        .map_err(ApiError::from)?;

    let result: Vec<Value> = members
        .into_iter()
        .map(|member| {
            json!({
                "alterId": member.alter_id,
                "isHost": member.is_host != 0,
                "addedAt": member.added_at
            })
        })
        .collect();

    Ok(Json(json!(result)))
}
