use crate::upload_dir::UploadDirCache;
use axum::{
    extract::{Extension, Multipart},
    Json,
};
use blake3;
use didhub_config::AppConfig;
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_db::{
    settings::SettingOperations, uploads::UploadOperations, Db, NewUpload, UpdateUserFields,
};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use image::GenericImageView;
use image::ImageFormat;
use tokio::fs;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

#[derive(serde::Serialize)]
pub struct AvatarResp {
    pub ok: bool,
    pub avatar: Option<String>,
}

pub async fn upload_avatar(
    Extension(user): Extension<CurrentUser>,
    Extension(_cfg): Extension<AppConfig>,
    Extension(db): Extension<Db>,
    Extension(udc): Extension<UploadDirCache>,
    mut multipart: Multipart,
) -> Result<Json<AvatarResp>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        "Starting avatar upload for user"
    );

    let mut new_avatar: Option<String> = None;
    let upload_dir = udc.ensure_dir().await.map_err(|e| {
        error!(
            user_id = %user.id,
            error = %e,
            "Failed to ensure upload directory exists"
        );
        AppError::Internal
    })?;
    debug!(
        user_id = %user.id,
        upload_dir = %upload_dir.display(),
        "Upload directory ready"
    );
    let mut orig_w: u32 = 0;
    let mut orig_h: u32 = 0;
    let mut final_w: u32 = 0;
    let mut final_h: u32 = 0;
    let mut raw_size: usize = 0;
    let mut out_size: usize = 0;
    let mut hash_hex = String::new();
    // Capture previous avatar to optionally clean up later
    let previous_avatar = db
        .fetch_user_by_id(user.id)
        .await
        .map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                "Failed to fetch user data for avatar upload"
            );
            AppError::Internal
        })?
        .and_then(|u| u.avatar);
    debug!(
        user_id = %user.id,
        has_previous_avatar = previous_avatar.is_some(),
        previous_avatar = ?previous_avatar,
        "Fetched user data for avatar upload"
    );

    // Load configurable max dimension from settings (fallback 512)
    let avatar_max_dim: u32 = db
        .get_setting("avatar.max_dim")
        .await
        .ok()
        .flatten()
        .and_then(|s| s.value.parse::<u32>().ok())
        .unwrap_or(512);
    debug!(
        user_id = %user.id,
        avatar_max_dim = avatar_max_dim,
        "Loaded avatar max dimension setting"
    );
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        error!(
            user_id = %user.id,
            error = %e,
            "Failed to read multipart field"
        );
        AppError::BadRequest("invalid multipart".into())
    })? {
        if let Some(name) = field.name() {
            if name != "file" {
                debug!(
                    user_id = %user.id,
                    field_name = %name,
                    "Skipping non-file multipart field"
                );
                continue;
            }
        }
        let orig = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("avatar-{}", Uuid::new_v4()));
        debug!(
            user_id = %user.id,
            original_filename = %orig,
            "Processing avatar file upload"
        );

        let raw_bytes = field.bytes().await.map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                "Failed to read file bytes from multipart"
            );
            AppError::BadRequest("failed to read file".into())
        })?;
        if raw_bytes.len() > 5 * 1024 * 1024 {
            warn!(
                user_id = %user.id,
                file_size = raw_bytes.len(),
                max_size = 5 * 1024 * 1024,
                "Avatar file exceeds maximum size limit"
            );
            return Err(AppError::BadRequest("file too large".into()));
        }
        raw_size = raw_bytes.len();
        debug!(
            user_id = %user.id,
            file_size = raw_size,
            "File size validation passed"
        );
        // Minimal MIME/type sniff (PNG/JPEG/GIF/WEBP magic numbers) before decode
        let is_supported = {
            let b = &raw_bytes;
            b.starts_with(&[0x89, b'P', b'N', b'G']) || // PNG
            (b.len()>2 && &b[..2] == b"\xFF\xD8") || // JPEG
            b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") || // GIF
            b.starts_with(b"RIFF") && b.len()>12 && &b[8..12] == b"WEBP" // WEBP container
        };
        if !is_supported {
            warn!(
                user_id = %user.id,
                file_size = raw_bytes.len(),
                "Unsupported image format detected"
            );
            return Err(AppError::BadRequest("unsupported image type".into()));
        }
        debug!(
            user_id = %user.id,
            "Image format validation passed"
        );

        // Decode using image crate (guess format)
        let img = image::load_from_memory(&raw_bytes).map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                "Failed to decode image data"
            );
            AppError::BadRequest("unsupported image".into())
        })?;
        let (ow, oh) = img.dimensions();
        orig_w = ow;
        orig_h = oh;
        debug!(
            user_id = %user.id,
            original_width = orig_w,
            original_height = orig_h,
            "Image decoded successfully"
        );
        // Resize if larger than avatar_max_dim in either dimension (maintain aspect)
        let processed = if orig_w > avatar_max_dim || orig_h > avatar_max_dim {
            let scale = if orig_w >= orig_h {
                avatar_max_dim as f32 / orig_w as f32
            } else {
                avatar_max_dim as f32 / orig_h as f32
            };
            let new_w = (orig_w as f32 * scale).round() as u32;
            let new_h = (orig_h as f32 * scale).round() as u32;
            debug!(
                user_id = %user.id,
                original_width = orig_w,
                original_height = orig_h,
                new_width = new_w,
                new_height = new_h,
                scale_factor = scale,
                "Resizing image to fit max dimension"
            );
            img.resize(
                new_w.max(1),
                new_h.max(1),
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            debug!(
                user_id = %user.id,
                width = orig_w,
                height = orig_h,
                "Image within size limits, no resizing needed"
            );
            img
        };
        // Always encode to PNG for uniform storage
        let mut out_buf: Vec<u8> = Vec::new();
        processed
            .write_to(&mut std::io::Cursor::new(&mut out_buf), ImageFormat::Png)
            .map_err(|e| {
                error!(
                    user_id = %user.id,
                    error = %e,
                    "Failed to encode image to PNG"
                );
                AppError::Internal
            })?;
        let (fw, fh) = processed.dimensions();
        final_w = fw;
        final_h = fh;
        let hash = blake3::hash(&out_buf);
        hash_hex = hash.to_hex().to_string();
        out_size = out_buf.len();
        debug!(
            user_id = %user.id,
            final_width = final_w,
            final_height = final_h,
            output_size = out_size,
            hash = %hash_hex,
            "Image processed and encoded successfully"
        );

        let final_name = format!("{}.png", hash_hex);
        let dest = upload_dir.join(&final_name);
        fs::write(&dest, &out_buf).await.map_err(|e| {
            error!(
                user_id = %user.id,
                error = %e,
                destination = %dest.display(),
                "Failed to write avatar file to disk"
            );
            AppError::Internal
        })?;
        debug!(
            user_id = %user.id,
            filename = %final_name,
            destination = %dest.display(),
            "Avatar file written to disk successfully"
        );
        let _ = db
            .insert_upload(NewUpload {
                stored_name: &final_name,
                original_name: Some(&orig),
                user_id: Some(user.id),
                mime: Some("image/png"),
                bytes: out_buf.len() as i64,
                hash: Some(&hash_hex),
            })
            .await;
        debug!(
            user_id = %user.id,
            stored_name = %final_name,
            original_name = %orig,
            file_size = out_buf.len(),
            "Upload record inserted into database"
        );

        new_avatar = Some(final_name);
        // Only process first matching file field
        break;
    }
    let Some(saved_name) = new_avatar.clone() else {
        warn!(
            user_id = %user.id,
            "No file field provided in multipart upload"
        );
        return Err(AppError::BadRequest("no file field provided".into()));
    };
    let mut fields = UpdateUserFields::default();
    fields.avatar = Some(Some(saved_name.clone()));
    db.update_user(user.id, fields).await.map_err(|e| {
        error!(
            user_id = %user.id,
            error = %e,
            avatar_filename = %saved_name,
            "Failed to update user avatar in database"
        );
        AppError::Internal
    })?;
    debug!(
        user_id = %user.id,
        avatar_filename = %saved_name,
        "User avatar updated in database successfully"
    );
    // Fire audit with metadata (dimensions & size)
    // Simple mime inference already validated; assume png output
    audit::record_with_metadata(
        &db,
        Some(user.id),
        "avatar.upload",
        Some("avatar"),
        Some(&saved_name),
        serde_json::json!({
            "user_id": user.id,
            "filename": saved_name,
            "replaced": previous_avatar,
            "max_dim": avatar_max_dim,
            "orig_width": orig_w,
            "orig_height": orig_h,
            "final_width": final_w,
            "final_height": final_h,
            "orig_bytes": raw_size,
            "final_bytes": out_size,
            "hash": hash_hex,
            "mime": "image/png"
        }),
    )
    .await;
    info!(
        user_id = %user.id,
        avatar_filename = %saved_name,
        original_width = orig_w,
        original_height = orig_h,
        final_width = final_w,
        final_height = final_h,
        original_size = raw_size,
        final_size = out_size,
        replaced_previous = previous_avatar.is_some(),
        "Avatar upload completed successfully"
    );

    // Schedule cleanup of old avatar (best-effort, ignore errors)
    if let Some(old) = previous_avatar {
        if old != saved_name {
            let dir = upload_dir.clone();
            debug!(
                user_id = %user.id,
                old_avatar = %old,
                "Scheduling cleanup of previous avatar file"
            );
            tokio::spawn(async move {
                let _ = fs::remove_file(dir.join(old)).await;
            });
        } else {
            debug!(
                user_id = %user.id,
                avatar_filename = %old,
                "Previous avatar same as new, no cleanup needed"
            );
        }
    }
    Ok(Json(AvatarResp {
        ok: true,
        avatar: new_avatar,
    }))
}

pub async fn delete_avatar(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
) -> Result<Json<AvatarResp>, AppError> {
    debug!(
        user_id = %user.id,
        username = %user.username,
        "Starting avatar deletion for user"
    );

    let mut fields = UpdateUserFields::default();
    fields.avatar = Some(None);
    db.update_user(user.id, fields).await.map_err(|e| {
        error!(
            user_id = %user.id,
            error = %e,
            "Failed to remove avatar from user record"
        );
        AppError::Internal
    })?;
    debug!(
        user_id = %user.id,
        "User avatar removed from database successfully"
    );

    audit::record_entity(
        &db,
        Some(user.id),
        "avatar.delete",
        "avatar",
        &user.id.to_string(),
    )
    .await;
    info!(
        user_id = %user.id,
        "Avatar deletion completed successfully"
    );

    Ok(Json(AvatarResp {
        ok: true,
        avatar: None,
    }))
}
