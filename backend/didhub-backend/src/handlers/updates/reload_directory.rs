use std::sync::Arc;

use axum::extract::Extension;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

/// POST /admin/upload-directory/reload
/// Reload the upload directory configuration from disk.
pub async fn reload_directory(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    crate::handlers::auth::utils::require_admin(&state, &headers).await?;

    let reloaded_at = Utc::now();

    // Get the uploads directory from config
    let config_path = std::env::var("DIDHUB_CONFIG_PATH").ok();
    let config = match config_path.as_deref() {
        Some(p) => didhub_config::load_config(Some(p))
            .map_err(|e| ApiError::Unexpected(format!("failed to load config: {}", e)))?,
        None => didhub_config::load_config::<&std::path::Path>(None)
            .map_err(|e| ApiError::Unexpected(format!("failed to load config: {}", e)))?,
    };

    let uploads_dir = &config.uploads.directory;

    // Verify the uploads directory exists
    let path = std::path::Path::new(uploads_dir);
    if !path.exists() {
        return Err(ApiError::bad_request(format!(
            "upload directory does not exist: {}",
            uploads_dir
        )));
    }

    if !path.is_dir() {
        return Err(ApiError::bad_request(format!(
            "upload path is not a directory: {}",
            uploads_dir
        )));
    }

    // Count files in the directory
    let file_count = std::fs::read_dir(path)
        .map_err(|e| ApiError::Unexpected(format!("failed to read upload directory: {}", e)))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .count();

    tracing::info!(
        uploads_dir = %uploads_dir,
        file_count = file_count,
        "upload directory reloaded"
    );

    Ok(Json(json!({
        "reloadedAt": reloaded_at.to_rfc3339(),
        "directory": uploads_dir,
        "fileCount": file_count,
        "status": "success"
    })))
}
