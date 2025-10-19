use std::collections::HashMap;
use std::sync::Arc;

use axum::Json;
use axum::body::Body;
use axum::extract::{Extension, Path, Query};
use axum::http::HeaderMap;
use axum::response::Response;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};

/// Returns JSON with URL and metadata for stored file
pub async fn serve_stored_file(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    let _auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let file_id_str = path
        .get("fileId")
        .ok_or_else(|| ApiError::not_found("file id missing"))?
        .to_string();
    let file_id: SqlxUuid =
        SqlxUuid::parse_str(&file_id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let stored_file = didhub_db::generated::stored_files::find_by_primary_key(&mut *conn, &file_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("file not found"))?;

    let cfg = didhub_config::load_config::<&std::path::Path>(None).unwrap_or_default();
    let uploads_dir = cfg.uploads.directory.clone();
    let mut file_path = std::path::PathBuf::from(&uploads_dir);
    file_path.push(file_id.to_string());

    if !file_path.exists() {
        return Err(ApiError::not_found("file not found on disk"));
    }

    let (opt_w, opt_h) = match query.map(|q| q.0) {
        Some(map) => {
            let w = map.get("w").and_then(|s| s.parse::<u32>().ok());
            let h = map.get("h").and_then(|s| s.parse::<u32>().ok());
            (w, h)
        }
        None => (None, None),
    };

    let mime_type = stored_file
        .mime_type
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let mut url = format!("/api/files/content/{file_id}");
    let mut params: Vec<String> = Vec::new();
    if let Some(w) = opt_w {
        params.push(format!("w={}", w));
    }
    if let Some(h) = opt_h {
        params.push(format!("h={}", h));
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    Ok(Json(serde_json::json!({
        "url": url,
        "mime_type": mime_type,
        "size": tokio::fs::metadata(&file_path).await.map(|m| m.len()).unwrap_or(0)
    })))
}

/// Serve raw file bytes (or thumbnail bytes) for direct consumption by clients
pub async fn serve_stored_file_content(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    Path(path): Path<HashMap<String, String>>,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Response, ApiError> {
    let _auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;
    let file_id_str = path
        .get("fileId")
        .ok_or_else(|| ApiError::not_found("file id missing"))?
        .to_string();
    let file_id: SqlxUuid =
        SqlxUuid::parse_str(&file_id_str).map_err(|_| ApiError::bad_request("invalid uuid"))?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let stored_file = didhub_db::generated::stored_files::find_by_primary_key(&mut *conn, &file_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("file not found"))?;

    let cfg = didhub_config::load_config::<&std::path::Path>(None).unwrap_or_default();
    let uploads_dir = cfg.uploads.directory.clone();
    let mut file_path = std::path::PathBuf::from(&uploads_dir);
    file_path.push(file_id.to_string());

    if !file_path.exists() {
        return Err(ApiError::not_found("file not found on disk"));
    }

    let (opt_w, opt_h) = match query.map(|q| q.0) {
        Some(map) => {
            let w = map.get("w").and_then(|s| s.parse::<u32>().ok());
            let h = map.get("h").and_then(|s| s.parse::<u32>().ok());
            (w, h)
        }
        None => (None, None),
    };

    let mime_type = stored_file
        .mime_type
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Only resize if both w and h are explicitly provided
    if mime_type.starts_with("image/") && opt_w.is_some() && opt_h.is_some() {
        let tw = opt_w.unwrap();
        let th = opt_h.unwrap();
        let mut thumbs_dir = std::path::PathBuf::from(&uploads_dir);
        thumbs_dir.push("thumbnails");
        if let Err(e) = tokio::fs::create_dir_all(&thumbs_dir).await {
            tracing::warn!(%e, "failed to create thumbnails dir");
        }
        let thumb_name = format!("{file_id}_{}x{}.jpg", tw, th);
        let mut thumb_path = thumbs_dir.clone();
        thumb_path.push(&thumb_name);

        if thumb_path.exists() {
            let content = tokio::fs::read(&thumb_path)
                .await
                .map_err(|e| ApiError::Unexpected(format!("failed to read thumbnail: {e}")))?;
            let resp = Response::builder()
                .status(axum::http::StatusCode::OK)
                .header("content-type", "image/jpeg")
                .body(Body::from(content))
                .map_err(|e| ApiError::Unexpected(format!("failed to build response: {e}")))?;
            return Ok(resp);
        }

        let content = tokio::fs::read(&file_path)
            .await
            .map_err(|e| ApiError::Unexpected(format!("failed to read file: {e}")))?;
        if let Ok(img) = image::load_from_memory(&content) {
            let thumb = img.resize(tw, th, image::imageops::FilterType::Lanczos3);
            let mut buf: Vec<u8> = Vec::new();
            if thumb
                .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg)
                .is_ok()
            {
                if let Err(e) = tokio::fs::write(&thumb_path, &buf).await {
                    tracing::warn!(%e, "failed to write thumbnail to disk");
                }
                let resp = Response::builder()
                    .status(axum::http::StatusCode::OK)
                    .header("content-type", "image/jpeg")
                    .body(Body::from(buf))
                    .map_err(|e| ApiError::Unexpected(format!("failed to build response: {e}")))?;
                return Ok(resp);
            }
        }

        let content = tokio::fs::read(&file_path)
            .await
            .map_err(|e| ApiError::Unexpected(format!("failed to read file: {e}")))?;
        let resp = Response::builder()
            .status(axum::http::StatusCode::OK)
            .header("content-type", mime_type.clone())
            .body(Body::from(content))
            .map_err(|e| ApiError::Unexpected(format!("failed to build response: {e}")))?;
        return Ok(resp);
    }

    let content = tokio::fs::read(&file_path)
        .await
        .map_err(|e| ApiError::Unexpected(format!("failed to read file: {e}")))?;
    let resp = Response::builder()
        .status(axum::http::StatusCode::OK)
        .header("content-type", mime_type.clone())
        .body(Body::from(content))
        .map_err(|e| ApiError::Unexpected(format!("failed to build response: {e}")))?;
    Ok(resp)
}
