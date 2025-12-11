use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Json, Path};
use serde_json::Value;

use crate::{error::ApiError, state::AppState};
use didhub_db::generated::alters as db_alters;
use sqlx::types::Uuid as SqlxUuid;

#[derive(serde::Deserialize)]
struct ImageUpload {
    filename: String,
    content: String,
}

/// Upload one or more images for an alter
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

    // Support both single file (legacy) and multiple files (new)
    let images_to_upload: Vec<ImageUpload> = if payload.get("images").is_some() {
        // New format: array of images
        serde_json::from_value(
            payload
                .get("images")
                .cloned()
                .ok_or_else(|| ApiError::bad_request("missing images"))?,
        )
        .map_err(ApiError::from)?
    } else {
        // Legacy format: single filename and content
        let filename: String = serde_json::from_value(
            payload
                .get("filename")
                .cloned()
                .ok_or_else(|| ApiError::bad_request("missing filename"))?,
        )
        .map_err(ApiError::from)?;

        let content: String = serde_json::from_value(
            payload
                .get("content")
                .cloned()
                .ok_or_else(|| ApiError::bad_request("missing content"))?,
        )
        .map_err(ApiError::from)?;

        vec![ImageUpload { filename, content }]
    };

    if images_to_upload.is_empty() {
        return Err(ApiError::bad_request("no images provided"));
    }

    // Verify alter exists and user owns it (or is admin)
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

    // Determine uploads directory from config
    let cfg = didhub_config::load_config::<&std::path::Path>(None).unwrap_or_default();
    let uploads_dir = cfg.uploads.directory.clone();

    let now = chrono::Utc::now().to_rfc3339();
    let mut uploaded_ids: Vec<String> = Vec::new();

    // Process each image
    for image in images_to_upload {
        // Accept data URLs or plain base64
        let base64_data = if let Some(comma) = image.content.find(',') {
            &image.content[(comma + 1)..]
        } else {
            &image.content
        };

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| ApiError::Unexpected(format!("base64 decode failed: {}", e)))?;

        // Store file with deduplication
        let store_result = crate::handlers::uploads::store_file::store_file_with_deduplication(
            &mut conn,
            &bytes,
            &image.filename,
            &uploads_dir,
        )
        .await?;

        let stored_file_id = store_result.stored_file_id;

        // Insert uploads row
        let new_upload = db_uploads::UploadsRow {
            id: SqlxUuid::new_v4(),
            stored_file_id,
            stored_name: image.filename.clone(),
            uploaded_by: user_id,
            created_at: now.clone(),
        };
        db_uploads::insert_upload(&mut *conn, &new_upload)
            .await
            .map_err(ApiError::from)?;

        uploaded_ids.push(stored_file_id.to_string());
    }

    // Update alter's images field - prepend all new images
    let mut updated_alter = alter;
    let mut images_vec: Vec<String> =
        serde_json::from_str(&updated_alter.images).unwrap_or_default();

    // Insert new images at the beginning (in order)
    for (i, id) in uploaded_ids.iter().enumerate() {
        images_vec.insert(i, id.clone());
    }

    updated_alter.images = serde_json::to_string(&images_vec).unwrap_or_else(|_| "[]".to_string());
    db_alters::update_by_primary_key(&mut *conn, &alter_id, &updated_alter)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(serde_json::json!({
        "uploadedIds": uploaded_ids,
        "primaryUploadId": uploaded_ids.first().cloned()
    })))
}
