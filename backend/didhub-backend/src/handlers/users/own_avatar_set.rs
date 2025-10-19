use std::sync::Arc;

use axum::extract::{Extension, Json};
use axum::http::HeaderMap;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use base64::Engine as _;
use chrono::Utc;
use didhub_db::generated::{uploads as db_uploads, users as db_users};

use crate::{error::ApiError, state::AppState};

/// Set own avatar. Accepts JSON body: { "filename": string, "content": "data:<mime>;base64,..." }
pub async fn own_avatar_set(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    let filename: String = serde_json::from_value(
        payload
            .get("filename")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing filename"))?,
    )
    .map_err(ApiError::from)?;

    let content_str: String = serde_json::from_value(
        payload
            .get("content")
            .cloned()
            .ok_or_else(|| ApiError::bad_request("missing content"))?,
    )
    .map_err(ApiError::from)?;

    let base64_data = if let Some(comma) = content_str.find(',') {
        &content_str[(comma + 1)..]
    } else {
        &content_str
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| ApiError::Unexpected(format!("base64 decode failed: {}", e)))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    // Determine uploads directory from config
    let cfg = didhub_config::load_config::<&std::path::Path>(None).unwrap_or_default();
    let uploads_dir = cfg.uploads.directory.clone();

    // Store file with deduplication
    let store_result = crate::handlers::uploads::store_file::store_file_with_deduplication(
        &mut conn,
        &bytes,
        &filename,
        &uploads_dir,
    )
    .await?;

    let stored_file_id = store_result.stored_file_id;
    let now = Utc::now().to_rfc3339();

    let new_upload = db_uploads::UploadsRow {
        id: SqlxUuid::new_v4(),
        stored_file_id,
        stored_name: filename.clone(),
        uploaded_by: user_id,
        created_at: now.clone(),
    };
    db_uploads::insert_upload(&mut *conn, &new_upload)
        .await
        .map_err(ApiError::from)?;

    let existing = db_users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?;
    let mut existing = existing.ok_or_else(|| ApiError::not_found("user not found"))?;
    existing.avatar = Some(stored_file_id.to_string());
    existing.updated_at = Utc::now().to_rfc3339();
    db_users::update_by_primary_key(&mut *conn, &user_id, &existing)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({"avatar": existing.avatar})))
}
