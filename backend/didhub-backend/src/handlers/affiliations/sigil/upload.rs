use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::affiliations as db_affiliations;
use sqlx::types::Uuid as SqlxUuid;

/// Upload a sigil image for an affiliation
pub async fn upload(
    Extension(state): Extension<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Result<Json<Value>, ApiError> {
    use base64::Engine;
    use didhub_db::generated::uploads as db_uploads;

    let auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let user_id = auth
        .user_id
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    let affiliation_id_str = path
        .get("affiliationId")
        .ok_or_else(|| ApiError::not_found("affiliation id missing"))?
        .to_string();
    let affiliation_id: SqlxUuid = SqlxUuid::parse_str(&affiliation_id_str)
        .map_err(|_| ApiError::bad_request("invalid affiliation uuid"))?;

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

    // Accept data URLs or plain base64
    let base64_data = if let Some(comma) = content_str.find(',') {
        &content_str[(comma + 1)..]
    } else {
        &content_str
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| ApiError::Unexpected(format!("base64 decode failed: {}", e)))?;

    // Verify affiliation exists and user owns it (or is admin)
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let affiliation = db_affiliations::find_by_primary_key(&mut *conn, &affiliation_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("affiliation not found"))?;

    let is_admin = auth.scopes.iter().any(|s| s == "admin");
    if let Some(owner_id) = affiliation.owner_user_id {
        if owner_id != user_id && !is_admin {
            return Err(ApiError::Authentication(
                didhub_auth::AuthError::AuthenticationFailed,
            ));
        }
    } else if !is_admin {
        return Err(ApiError::Authentication(
            didhub_auth::AuthError::AuthenticationFailed,
        ));
    }

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
    let now = chrono::Utc::now().to_rfc3339();

    // Insert uploads row
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

    // Update affiliation's sigil field
    let mut updated_affiliation = affiliation;
    updated_affiliation.sigil = Some(stored_file_id.to_string());
    db_affiliations::update_by_primary_key(&mut *conn, &affiliation_id, &updated_affiliation)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({
        "sigilId": stored_file_id.to_string()
    })))
}
