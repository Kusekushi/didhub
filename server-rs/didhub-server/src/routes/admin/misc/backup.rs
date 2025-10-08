use axum::{
    extract::Extension,
    http::{HeaderMap, HeaderValue},
    response::IntoResponse,
};
use didhub_config::AppConfig;
use didhub_db::{audit, Db, DbBackend};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use std::path::Path;
use tokio::fs;
use tracing::{error, info, warn};
use uuid::Uuid;
use zip::write::FileOptions;
use zip::ZipWriter;
use std::io::Write;

async fn add_file_to_zip(zip: &mut ZipWriter<std::io::Cursor<&mut Vec<u8>>>, file_path: &Path, zip_path: &str) -> Result<(), AppError> {
    let content = fs::read(file_path).await.map_err(|e| {
        error!(file_path=%file_path.display(), error=%e, "failed to read file for backup");
        AppError::Internal
    })?;
    
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    
    zip.start_file(zip_path, options).map_err(|e| {
        error!(zip_path=%zip_path, error=%e, "failed to start zip file entry");
        AppError::Internal
    })?;
    
    zip.write_all(&content).map_err(|e| {
        error!(zip_path=%zip_path, error=%e, "failed to write to zip file");
        AppError::Internal
    })?;
    
    Ok(())
}

async fn add_directory_to_zip(zip: &mut ZipWriter<std::io::Cursor<&mut Vec<u8>>>, dir_path: &Path, zip_prefix: &str) -> Result<(), AppError> {
    let mut entries = fs::read_dir(dir_path).await.map_err(|e| {
        error!(dir_path=%dir_path.display(), error=%e, "failed to read directory for backup");
        AppError::Internal
    })?;

    while let Some(entry) = entries.next_entry().await.map_err(|e| {
        error!(dir_path=%dir_path.display(), error=%e, "failed to read directory entry");
        AppError::Internal
    })? {
        let path = entry.path();
        let file_name = path.file_name().unwrap().to_string_lossy();

        if path.is_file() {
            let zip_path = if zip_prefix.is_empty() {
                file_name.to_string()
            } else {
                format!("{}/{}", zip_prefix, file_name)
            };
            add_file_to_zip(zip, &path, &zip_path).await?;
        } else if path.is_dir() {
            // Recursively add subdirectories
            let sub_zip_prefix = if zip_prefix.is_empty() {
                file_name.to_string()
            } else {
                format!("{}/{}", zip_prefix, file_name)
            };
            Box::pin(add_directory_to_zip(zip, &path, &sub_zip_prefix)).await?;
        }
    }

    Ok(())
}

async fn backup_database(zip: &mut ZipWriter<std::io::Cursor<&mut Vec<u8>>>, db: &Db) -> Result<(), AppError> {
    match db.backend {
        DbBackend::Sqlite => {
            // Extract the file path from SQLite URL, handling Windows paths correctly
            let path_part = db.url.strip_prefix("sqlite://").unwrap_or("");
            // strip query params if present
            let mut file_path = path_part.split('?').next().unwrap_or(path_part).to_string();
            // On Windows a rebuilt URL may look like "sqlite:///E:/..." which when
            // stripping the "sqlite://" prefix leaves a leading '/' ("/E:/...").
            // Convert "/E:/..." -> "E:/..." so Path/FS operations work correctly.
            if cfg!(windows) {
                if file_path.starts_with('/') {
                    // If second char is a drive letter and third is ':' then trim the leading '/'
                    if file_path.len() > 2 {
                        let bytes = file_path.as_bytes();
                        if bytes[1].is_ascii_alphabetic() && bytes[2] == b':' {
                            file_path = file_path.trim_start_matches('/').to_string();
                        }
                    }
                }
            }
            
            let db_path = Path::new(&file_path);
            if db_path.exists() {
                add_file_to_zip(zip, db_path, "database.sqlite").await?;
            } else {
                warn!("SQLite database file not found at {}", db.url);
            }
        }
        DbBackend::Postgres => {
            // For Postgres, create a dump using pg_dump
            // TODO: Implement Postgres backup
            warn!("Postgres backup not yet implemented");
        }
        DbBackend::MySql => {
            // For MySQL, create a dump using mysqldump
            // This is more complex as we need to parse the URL
            warn!("MySQL backup not yet implemented");
        }
    }
    
    Ok(())
}

pub async fn create_backup(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Extension(config): Extension<AppConfig>,
) -> Result<impl IntoResponse, AppError> {
    if !user.is_admin {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to create backup");
        return Err(AppError::Forbidden);
    }

    info!(user_id=%user.id, "starting backup creation");

    let backup_id = Uuid::new_v4().to_string();
    
    // Create a temporary zip file in memory
    let mut zip_buffer = Vec::new();
    {
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut zip_buffer));
        
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        // Add database backup
        backup_database(&mut zip, &db).await?;

        // Add uploads directory
        let uploads_path = Path::new(&config.upload_dir);
        if uploads_path.exists() {
            add_directory_to_zip(&mut zip, uploads_path, "uploads").await?;
        } else {
            warn!(upload_dir=%config.upload_dir, "uploads directory not found");
        }

        // Add backup info
        zip.start_file("backup-info.txt", options).map_err(|e| {
            error!(user_id=%user.id, error=%e, "failed to create zip file");
            AppError::Internal
        })?;
        
        let info_content = format!("DIDHub Backup\nID: {}\nCreated: {}\nDatabase: {:?}\nUploads: {}\n", 
            backup_id, chrono::Utc::now().to_rfc3339(), db.backend, config.upload_dir);
        zip.write_all(info_content.as_bytes()).map_err(|e| {
            error!(user_id=%user.id, error=%e, "failed to write to zip file");
            AppError::Internal
        })?;
        
        zip.finish().map_err(|e| {
            error!(user_id=%user.id, error=%e, "failed to finish zip file");
            AppError::Internal
        })?;
    } // zip goes out of scope here

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "admin.backup.create",
        Some("backup"),
        None,
        serde_json::json!({
            "backup_id": backup_id,
        }),
    )
    .await;

    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=didhub-backup-{}.zip", backup_id)).unwrap(),
    );

    info!(user_id=%user.id, backup_id=%backup_id, "backup created successfully");

    Ok((headers, zip_buffer))
}