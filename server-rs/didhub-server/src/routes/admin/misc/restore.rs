use axum::{extract::{Extension, Multipart}, Json};
use didhub_config::AppConfig;
use didhub_db::{audit, Db, DbBackend};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::Serialize;
use tracing::{error, info, warn};
use zip::ZipArchive;
use std::io::Cursor;
use std::path::Path;
use tokio::fs;

#[derive(Serialize)]
pub struct RestoreResponse {
    pub success: bool,
    pub message: String,
}

async fn restore_from_archive(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    db: &Db,
    config: &AppConfig,
) -> Result<(), AppError> {
    // First pass: collect all file data synchronously
    let mut files_to_restore = Vec::new();
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| {
            error!(index=%i, error=%e, "failed to read zip entry");
            AppError::Internal
        })?;

        let file_name = file.name().to_string();

        if file_name == "database.sqlite" || file_name.starts_with("uploads/") {
            // Read file content synchronously
            let mut content = Vec::new();
            std::io::Read::read_to_end(&mut file, &mut content).map_err(|e| {
                error!(file=%file_name, error=%e, "failed to read file from zip");
                AppError::Internal
            })?;
            
            files_to_restore.push((file_name, content));
        }
    }

    // Second pass: restore files asynchronously
    for (file_name, content) in files_to_restore {
        if file_name == "database.sqlite" {
            // Restore database
            match db.backend {
                DbBackend::Sqlite => {
                    // Extract the file path from SQLite URL, handling Windows paths correctly
                    let path_part = db.url.strip_prefix("sqlite://").unwrap_or("");
                    // strip query params if present
                    let mut db_path_str = path_part.split('?').next().unwrap_or(path_part).to_string();
                    // On Windows a rebuilt URL may look like "sqlite:///E:/..." which when
                    // stripping the "sqlite://" prefix leaves a leading '/' ("/E:/...").
                    // Convert "/E:/..." -> "E:/..." so Path/FS operations work correctly.
                    if cfg!(windows) {
                        if db_path_str.starts_with('/') {
                            // If second char is a drive letter and third is ':' then trim the leading '/'
                            if db_path_str.len() > 2 {
                                let bytes = db_path_str.as_bytes();
                                if bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
                                    db_path_str = db_path_str.trim_start_matches('/').to_string();
                                }
                            }
                        }
                    }
                    
                    let db_path = Path::new(&db_path_str);

                    // Create backup of current database
                    if db_path.exists() {
                        let backup_path = format!("{}.backup", db_path_str);
                        fs::copy(&db_path, &backup_path).await.map_err(|e| {
                            error!(original=%db_path.display(), backup=%backup_path, error=%e, "failed to backup current database");
                            AppError::Internal
                        })?;
                        info!(original=%db_path.display(), backup=%backup_path, "created backup of current database");
                    }

                    // Write new database file
                    fs::write(&db_path, &content).await.map_err(|e| {
                        error!(path=%db_path.display(), error=%e, "failed to write restored database");
                        AppError::Internal
                    })?;

                    info!(path=%db_path.display(), "database restored successfully");
                }
                _ => {
                    warn!(backend=?db.backend, "database restore only supported for SQLite");
                }
            }
        } else if file_name.starts_with("uploads/") {
            // Restore uploads
            let relative_path = file_name.trim_start_matches("uploads/");
            if !relative_path.is_empty() {
                let target_path = Path::new(&config.upload_dir).join(relative_path);

                // Create parent directories if needed
                if let Some(parent) = target_path.parent() {
                    fs::create_dir_all(parent).await.map_err(|e| {
                        error!(path=%parent.display(), error=%e, "failed to create upload directory");
                        AppError::Internal
                    })?;
                }

                // Write file
                fs::write(&target_path, &content).await.map_err(|e| {
                    error!(path=%target_path.display(), error=%e, "failed to write restored upload file");
                    AppError::Internal
                })?;

                info!(path=%target_path.display(), "upload file restored");
            }
        }
    }

    Ok(())
}

#[axum::debug_handler]
pub async fn restore_backup(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(config): Extension<AppConfig>,
    mut multipart: Multipart,
) -> Result<Json<RestoreResponse>, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to restore backup");
        return Err(AppError::Forbidden);
    }

    info!(user_id=%user.id, "starting backup restore");

    // Read the uploaded zip file
    let mut zip_data = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        error!(user_id=%user.id, error=%e, "failed to read multipart field");
        AppError::BadRequest("Invalid multipart data".to_string())
    })? {
        if let Some("backup") = field.name() {
            let data = field.bytes().await.map_err(|e| {
                error!(user_id=%user.id, error=%e, "failed to read backup file data");
                AppError::BadRequest("Failed to read backup file".to_string())
            })?;
            zip_data = data.to_vec();
            break;
        }
    }

    if zip_data.is_empty() {
        return Ok(Json(RestoreResponse {
            success: false,
            message: "No backup file provided".to_string(),
        }));
    }

    // Extract the zip
    let cursor = Cursor::new(zip_data);
    let mut archive = ZipArchive::new(cursor).map_err(|e| {
        error!(user_id=%user.id, error=%e, "failed to open zip archive");
        AppError::BadRequest("Invalid backup file format".to_string())
    })?;

    // Perform the restore
    restore_from_archive(&mut archive, &db, &config).await?;

    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "admin.backup.restore",
        Some("backup"),
        None,
        serde_json::json!({
            "file_count": archive.len(),
        }),
    )
    .await;

    info!(user_id=%user.id, file_count=%archive.len(), "backup restore completed successfully");

    Ok(Json(RestoreResponse {
        success: true,
        message: "Backup restore completed successfully. A server restart is recommended.".to_string(),
    }))
}