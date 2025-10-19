use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::{Extension, Query};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::Value;
use sqlx::types::Uuid as SqlxUuid;

use crate::{error::ApiError, state::AppState};

pub async fn serve_stored_files_batch(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
    query: Option<Query<HashMap<String, String>>>,
) -> Result<Json<Value>, ApiError> {
    let _auth =
        crate::handlers::auth::utils::authenticate_and_require_approved(&state, &headers).await?;

    let (ids_param, opt_w, opt_h) = match query.map(|q| q.0) {
        Some(map) => (
            map.get("ids").cloned().unwrap_or_default(),
            map.get("w").and_then(|s| s.parse::<u32>().ok()),
            map.get("h").and_then(|s| s.parse::<u32>().ok()),
        ),
        None => (String::new(), None, None),
    };

    if ids_param.is_empty() {
        return Err(ApiError::bad_request("missing ids parameter"));
    }

    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;

    for id_raw in ids_param
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        let id_str = id_raw.to_string();
        if let Ok(file_id) = SqlxUuid::parse_str(&id_str) {
            match didhub_db::generated::stored_files::find_by_primary_key(&mut *conn, &file_id)
                .await
            {
                Ok(Some(stored_file)) => {
                    let cfg =
                        didhub_config::load_config::<&std::path::Path>(None).unwrap_or_default();
                    let uploads_dir = cfg.uploads.directory.clone();
                    let mut file_path = std::path::PathBuf::from(&uploads_dir);
                    file_path.push(file_id.to_string());

                    if !file_path.exists() {
                        results.push(serde_json::json!({ "file_id": file_id.to_string(), "error": "file not found" }));
                        continue;
                    }

                    match tokio::fs::read(&file_path).await {
                        Ok(content) => {
                            let mime_type = stored_file
                                .mime_type
                                .clone()
                                .unwrap_or_else(|| "application/octet-stream".to_string());

                            if mime_type.starts_with("image/") {
                                let tw = opt_w.unwrap_or(160);
                                let th = opt_h.unwrap_or(160);

                                let mut thumbs_dir = std::path::PathBuf::from(&uploads_dir);
                                thumbs_dir.push("thumbnails");
                                if let Err(e) = tokio::fs::create_dir_all(&thumbs_dir).await {
                                    tracing::warn!(%e, "failed to create thumbnails dir");
                                }
                                let thumb_name = format!("{file_id}_{}x{}.jpg", tw, th);
                                let mut thumb_path = thumbs_dir.clone();
                                thumb_path.push(&thumb_name);

                                if thumb_path.exists() {
                                    if let Ok(tbuf) = tokio::fs::read(&thumb_path).await {
                                        let mut url = format!("/api/files/content/{file_id}");
                                        let mut params: Vec<String> = Vec::new();
                                        if let Some(w) = opt_w {
                                            params.push(format!("w={w}"));
                                        }
                                        if let Some(h) = opt_h {
                                            params.push(format!("h={h}"));
                                        }
                                        if !params.is_empty() {
                                            url.push('?');
                                            url.push_str(&params.join("&"));
                                        }
                                        results.push(serde_json::json!({
                                            "file_id": file_id.to_string(),
                                            "url": url,
                                            "mime_type": "image/jpeg",
                                            "size": tbuf.len()
                                        }));
                                        continue;
                                    }
                                }

                                if let Ok(img) = image::load_from_memory(&content) {
                                    let thumb = img.resize(tw, th, image::imageops::FilterType::Lanczos3);
                                    let mut buf: Vec<u8> = Vec::new();
                                    if thumb
                                        .write_to(
                                            &mut std::io::Cursor::new(&mut buf),
                                            image::ImageFormat::Jpeg,
                                        )
                                        .is_ok()
                                    {
                                        if let Err(e) = tokio::fs::write(&thumb_path, &buf).await {
                                            tracing::warn!(%e, "failed to write thumbnail to disk");
                                        }
                                        let mut url = format!("/api/files/content/{file_id}");
                                        let mut params: Vec<String> = Vec::new();
                                        if let Some(w) = opt_w {
                                            params.push(format!("w={w}"));
                                        }
                                        if let Some(h) = opt_h {
                                            params.push(format!("h={h}"));
                                        }
                                        if !params.is_empty() {
                                            url.push('?');
                                            url.push_str(&params.join("&"));
                                        }
                                        results.push(serde_json::json!({
                                            "file_id": file_id.to_string(),
                                            "url": url,
                                            "mime_type": "image/jpeg",
                                            "size": buf.len()
                                        }));
                                        continue;
                                    }
                                }
                            }

                            let mut url = format!("/api/files/content/{file_id}");
                            let mut params: Vec<String> = Vec::new();
                            if let Some(w) = opt_w {
                                params.push(format!("w={w}"));
                            }
                            if let Some(h) = opt_h {
                                params.push(format!("h={h}"));
                            }
                            if !params.is_empty() {
                                url.push('?');
                                url.push_str(&params.join("&"));
                            }
                            results.push(serde_json::json!({
                                "file_id": file_id.to_string(),
                                "url": url,
                                "mime_type": mime_type,
                                "size": content.len()
                            }));
                        }
                        Err(e) => {
                            tracing::warn!(%e, "failed to read file");
                            results.push(serde_json::json!({ "file_id": file_id.to_string(), "error": "failed to read file" }));
                            continue;
                        }
                    }
                }
                Ok(None) => {
                    results.push(serde_json::json!({ "file_id": id_str, "error": "not found" }));
                    continue;
                }
                Err(e) => {
                    tracing::warn!(%e, "db error fetching stored_file");
                    results.push(serde_json::json!({ "file_id": id_str, "error": "db error" }));
                    continue;
                }
            }
        } else {
            results.push(serde_json::json!({ "file_id": id_str, "error": "invalid uuid" }));
            continue;
        }
    }

    Ok(Json(serde_json::Value::Array(results)))
}
