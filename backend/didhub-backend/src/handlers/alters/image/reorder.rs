use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

/// Reorder images for an alter (change which is primary)
pub async fn reorder(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let alter_id_str = path
        .get("alterId")
        .ok_or_else(|| ApiError::not_found("alter id missing"))?
        .to_string();
    let alter_id: SqlxUuid = SqlxUuid::parse_str(&alter_id_str)
        .map_err(|_| ApiError::bad_request("invalid alter uuid"))?;

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    let new_order: Vec<String> = serde_json::from_value(
        payload
            .get("imageIds")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing imageIds"))?,
    )
    .map_err(ApiError::from)?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let alter = db_alters::find_by_primary_key(&mut *conn, &alter_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("alter not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if alter.owner_user_id != user_id && !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

    // Validate that all provided IDs exist in the current images array
    let current_images: Vec<String> = serde_json::from_str(&alter.images).unwrap_or_default();

    for id in &new_order {
        if !current_images.contains(id) {
            return Err(ApiError::bad_request(format!(
                "image id {} not found in current images",
                id
            )));
        }
    }

    // Ensure all current images are in the new order
    if new_order.len() != current_images.len() {
        return Err(ApiError::bad_request(
            "new order must contain all current images",
        ));
    }

    // Update the images array with the new order
    let mut updated_alter = alter;
    updated_alter.images = serde_json::to_string(&new_order).unwrap_or_else(|_| "[]".to_string());
    db_alters::update_by_primary_key(&mut *conn, &alter_id, &updated_alter)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({
        "success": true,
        "imageIds": new_order
    })))
}
