use crate::upload_dir::UploadDirCache;
use axum::body::Bytes;
use axum::{
    extract::{Extension, Multipart, Path},
    response::{IntoResponse, Response},
    Json,
};
use blake3;
use didhub_config::AppConfig;
use didhub_db::audit;
use didhub_db::settings::SettingOperations;
use didhub_db::uploads::UploadOperations;
use didhub_db::Db;
use didhub_db::NewUpload;
use didhub_error::AppError;
use didhub_image::process_image_simple;
use didhub_metrics::record_upload_operation;
use didhub_middleware::types::CurrentUser;
use sanitize_filename::sanitize;
use serde::Serialize;
use std::path::{Path as StdPath, PathBuf};
use tokio::fs;
use tracing::{debug, info, warn};
use uuid::Uuid;

#[derive(Serialize)]
pub struct UploadResp {
    pub ok: bool,
    pub filename: String,
}

pub async fn upload_file(
    Extension(_cfg): Extension<AppConfig>,
    Extension(db): Extension<Db>,
    Extension(user): Extension<CurrentUser>,
    Extension(udc): Extension<UploadDirCache>,
    mut multipart: Multipart,
) -> Result<Json<UploadResp>, AppError> {
    debug!(user_id=%user.id, username=%user.username, "starting file upload");
    let upload_dir = udc.ensure_dir().await.map_err(|_| AppError::Internal)?;
    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(_) => {
                record_upload_operation("upload", "failure", None);
                return Err(AppError::BadRequest("invalid multipart".into()));
            }
        };
        if let Some(name) = field.name() {
            if name != "file" {
                continue;
            }
        }
        let original_name = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("upload-{}", Uuid::new_v4()));
        let raw = field.bytes().await.map_err(|_| {
            record_upload_operation("upload", "failure", None);
            AppError::BadRequest("failed to read file".into())
        })?;
        debug!(user_id=%user.id, original_name=%original_name, file_size=%raw.len(), "processing uploaded file");
        let safe_original = sanitize(&original_name);
        let mut metadata = serde_json::Map::new();
        metadata.insert("orig_bytes".into(), serde_json::json!(raw.len()));
        metadata.insert(
            "original_name".into(),
            serde_json::json!(safe_original.clone()),
        );
        // Basic MIME detection via magic numbers
        let mime_guess = {
            let b = &raw;
            if b.starts_with(&[0x89, b'P', b'N', b'G']) {
                Some("image/png")
            } else if b.len() > 2 && &b[..2] == b"\xFF\xD8" {
                Some("image/jpeg")
            } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
                Some("image/gif")
            } else if b.starts_with(b"RIFF") && b.len() > 12 && &b[8..12] == b"WEBP" {
                Some("image/webp")
            } else {
                None
            }
        };
        if let Some(m) = mime_guess {
            metadata.insert("mime".into(), serde_json::json!(m));
        }
        let maybe_image = if let Some(ref mime) = mime_guess {
            didhub_image::is_image_mime(mime)
        } else {
            false
        };
        if maybe_image {
            let max_dim: u32 = db
                .get_setting("upload.image.max_dim")
                .await
                .ok()
                .flatten()
                .and_then(|s| s.value.parse::<u32>().ok())
                .unwrap_or(2048);
            match process_image_simple(&raw, max_dim) {
                Ok((processed_bytes, img_metadata)) => {
                    metadata.insert(
                        "orig_width".into(),
                        serde_json::json!(img_metadata.orig_width),
                    );
                    metadata.insert(
                        "orig_height".into(),
                        serde_json::json!(img_metadata.orig_height),
                    );
                    metadata.insert(
                        "final_width".into(),
                        serde_json::json!(img_metadata.final_width),
                    );
                    metadata.insert(
                        "final_height".into(),
                        serde_json::json!(img_metadata.final_height),
                    );
                    metadata.insert("max_dim".into(), serde_json::json!(img_metadata.max_dim));
                    metadata.insert(
                        "final_bytes".into(),
                        serde_json::json!(img_metadata.final_bytes),
                    );
                    metadata.insert(
                        "converted".into(),
                        serde_json::json!(img_metadata.converted),
                    );
                    // Dedup by content hash (blake3) of processed bytes
                    let hash = blake3::hash(&processed_bytes);
                    let hash_hex = hash.to_hex().to_string();
                    metadata.insert("hash".into(), serde_json::json!(hash_hex.clone()));
                    let final_name = format!("{}.png", hash_hex);
                    let dest = upload_dir.join(&final_name);
                    if !dest.exists() {
                        fs::write(&dest, &processed_bytes)
                            .await
                            .map_err(|_| AppError::Internal)?;
                    }
                    let _ = db
                        .insert_upload(NewUpload {
                            stored_name: &final_name,
                            original_name: Some(&original_name),
                            user_id: Some(user.id.clone()),
                            mime: Some("image/png"),
                            bytes: processed_bytes.len() as i64,
                            hash: Some(&hash_hex),
                        })
                        .await;
                    info!(user_id=%user.id, username=%user.username, filename=%final_name, original_name=%original_name, file_size=%processed_bytes.len(), "image uploaded and processed successfully");
                    record_upload_operation(
                        "upload",
                        "success",
                        Some(processed_bytes.len() as i64),
                    );
                    audit::record_with_metadata(
                        &db,
                        Some(user.id.as_str()),
                        "upload.create",
                        Some("upload"),
                        Some(&final_name),
                        serde_json::Value::Object(metadata.clone()),
                    )
                    .await;
                    return Ok(Json(UploadResp {
                        ok: true,
                        filename: final_name,
                    }));
                }
                Err(e) => {
                    warn!(user_id=%user.id, error=%e, "failed to process image");
                    // Fall through to non-image handling
                }
            }
        }
        // Non-image whitelist by extension
        let allowed_exts = ["txt", "pdf", "json", "csv", "md", "log"];
        let ext = StdPath::new(&safe_original)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !allowed_exts.contains(&ext.as_str()) {
            warn!(user_id=%user.id, username=%user.username, file_extension=%ext, "rejected file upload - extension not allowed");
            record_upload_operation("upload", "failure", Some(raw.len() as i64));
            return Err(AppError::BadRequest("file type not allowed".into()));
        }
        if raw.len() > 10 * 1024 * 1024 {
            warn!(user_id=%user.id, username=%user.username, file_size=%raw.len(), "rejected file upload - file too large");
            record_upload_operation("upload", "failure", Some(raw.len() as i64));
            return Err(AppError::BadRequest("file too large".into()));
        }
        let safe_name = safe_original;
        let dest = upload_dir.join(&safe_name);
        fs::write(&dest, &raw)
            .await
            .map_err(|_| AppError::Internal)?;
        metadata.insert("final_bytes".into(), serde_json::json!(raw.len()));
        metadata.insert("converted".into(), serde_json::json!(false));
        if let Some(m) = mime_guess {
            metadata.insert("mime".into(), serde_json::json!(m));
        }
        let hash = blake3::hash(&raw);
        metadata.insert("hash".into(), serde_json::json!(hash.to_hex().to_string()));
        metadata.insert("ext".into(), serde_json::json!(ext));
        let _ = db
            .insert_upload(NewUpload {
                stored_name: &safe_name,
                original_name: Some(&original_name),
                user_id: Some(user.id.clone()),
                mime: mime_guess,
                bytes: raw.len() as i64,
                hash: Some(&hash.to_hex().to_string()),
            })
            .await;
        info!(user_id=%user.id, username=%user.username, filename=%safe_name, original_name=%original_name, file_size=%raw.len(), file_type=%ext, "file uploaded successfully");
        record_upload_operation("upload", "success", Some(raw.len() as i64));
        audit::record_with_metadata(
            &db,
            Some(user.id.as_str()),
            "upload.create",
            Some("upload"),
            Some(&safe_name),
            serde_json::Value::Object(metadata.clone()),
        )
        .await;
        return Ok(Json(UploadResp {
            ok: true,
            filename: safe_name,
        }));
    }
    record_upload_operation("upload", "failure", None);
    Err(AppError::BadRequest("no file field provided".into()))
}

pub async fn list_uploads(
    Extension(db): Extension<Db>,
) -> Result<Json<serde_json::Value>, AppError> {
    debug!("listing all uploaded files");
    let names = db
        .list_upload_filenames()
        .await
        .map_err(|_| AppError::Internal)?;
    debug!(file_count=%names.len(), "upload files listed");
    Ok(Json(serde_json::json!({"files": names})))
}

pub async fn serve_file(
    Extension(_cfg): Extension<AppConfig>,
    Extension(udc): Extension<UploadDirCache>,
    Path(filename): Path<String>,
) -> Result<Response, AppError> {
    debug!(filename=%filename, "serving uploaded file");
    let upload_dir = PathBuf::from(udc.current().await);
    let path = upload_dir.join(&filename);
    if !StdPath::new(&path).exists() {
        warn!(filename=%filename, "requested file not found");
        return Err(AppError::NotFound);
    }
    // rely on tokio fs read and return bytes
    let bytes = fs::read(&path).await.map_err(|_| AppError::Internal)?;
    let b: Bytes = Bytes::from(bytes);
    debug!(filename=%filename, file_size=%b.len(), "file served successfully");
    Ok((axum::http::StatusCode::OK, b).into_response())
}
