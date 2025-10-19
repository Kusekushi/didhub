use std::fs;
use std::path::PathBuf;

use sha2::{Digest, Sha256};
use sqlx::types::Uuid as SqlxUuid;

use didhub_db::generated::stored_files as db_stored_files;
use crate::error::ApiError;

/// Result of storing a file, indicating whether it was newly stored or deduplicated
pub struct StoredFileResult {
    /// The ID of the stored file (either newly created or existing)
    pub stored_file_id: SqlxUuid,
    /// Whether this was a new file (true) or a deduplicated existing file (false)
    pub is_new: bool,
}

/// Store a file with deduplication based on hash.
/// 
/// This function:
/// 1. Computes the SHA256 hash of the file content
/// 2. Checks if a file with the same hash already exists in the database
/// 3. If it exists, returns the existing file ID (deduplication)
/// 4. If not, writes the file to disk and creates a new database record
///
/// # Arguments
/// * `conn` - Mutable reference to database connection
/// * `bytes` - The file content as bytes
/// * `filename` - Original filename (used for MIME type detection)
/// * `uploads_dir` - Directory where files should be stored
///
/// # Returns
/// * `StoredFileResult` containing the file ID and whether it was newly stored
pub async fn store_file_with_deduplication(
    conn: &mut sqlx::pool::PoolConnection<didhub_db::DbBackend>,
    bytes: &[u8],
    filename: &str,
    uploads_dir: &str,
) -> Result<StoredFileResult, ApiError> {
    // Compute file hash
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let hash_hex = hex::encode(digest);

    // Check if file with same hash already exists
    let existing_file: Option<db_stored_files::StoredFilesRow> = sqlx::query_as(
        "SELECT id, file_hash, mime_type, size, created_at FROM stored_files WHERE file_hash = ?"
    )
    .bind(&hash_hex)
    .fetch_optional(&mut **conn)
    .await
    .map_err(ApiError::from)?;

    if let Some(existing) = existing_file {
        // File with same hash exists, reuse it (deduplication)
        return Ok(StoredFileResult {
            stored_file_id: existing.id,
            is_new: false,
        });
    }

    // New file, store it
    let mut path = PathBuf::from(uploads_dir);
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| ApiError::Unexpected(format!("failed to create uploads directory: {e}")))?;
    }

    let new_stored_file_id: SqlxUuid = SqlxUuid::new_v4();
    path.push(new_stored_file_id.to_string());
    fs::write(&path, bytes)
        .map_err(|e| ApiError::Unexpected(format!("failed to write file: {e}")))?;

    // Insert stored_files row
    let now = chrono::Utc::now().to_rfc3339();
    let stored_row = db_stored_files::StoredFilesRow {
        id: new_stored_file_id,
        file_hash: hash_hex,
        mime_type: Some(
            mime_guess::from_path(filename)
                .first_or_octet_stream()
                .essence_str()
                .to_string(),
        ),
        size: Some(bytes.len() as f64),
        created_at: now,
    };
    
    db_stored_files::insert_stored_file(&mut **conn, &stored_row)
        .await
        .map_err(ApiError::from)?;

    Ok(StoredFileResult {
        stored_file_id: new_stored_file_id,
        is_new: true,
    })
}
