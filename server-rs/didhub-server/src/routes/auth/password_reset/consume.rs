use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHasher};
use axum::{extract::Extension, Json};
use base64::Engine;
use blake3;
use didhub_db::users::UserOperations;
use didhub_db::{audit, Db};
use didhub_error::AppError;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

#[derive(Debug, Deserialize)]
pub struct ConsumePayload {
    pub selector: String,
    pub verifier: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct ConsumeOut {
    pub ok: bool,
}

pub async fn consume_reset(
    Extension(db): Extension<Db>,
    Json(payload): Json<ConsumePayload>,
) -> Result<Json<ConsumeOut>, AppError> {
    debug!(selector=%payload.selector, "consuming password reset token");

    if payload.new_password.len() < 6 {
        warn!(selector=%payload.selector, "password reset failed - password too short");
        return Err(AppError::BadRequest("password too short".into()));
    }

    let Some(rec) = db
        .fetch_password_reset_by_selector(&payload.selector)
        .await
        .map_err(|_| AppError::Internal)?
    else {
        warn!(selector=%payload.selector, "password reset failed - token not found");
        return Err(AppError::BadRequest("invalid token".into()));
    };

    let now = chrono::Utc::now().to_rfc3339();
    let is_valid = db
        .validate_password_reset_token(&rec.id.to_string(), &now)
        .await
        .map_err(|_| AppError::Internal)?;

    if !is_valid {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "password reset failed - token expired or already used");
        return Err(AppError::BadRequest("token expired or used".into()));
    }

    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.verifier.as_bytes())
        .map_err(|_| AppError::BadRequest("invalid verifier".into()))?;
    let mut hasher = blake3::Hasher::new();
    hasher.update(&raw);
    let hash_hex = hasher.finalize().to_hex().to_string();

    if hash_hex != rec.verifier_hash {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "password reset failed - invalid verifier hash");
        return Err(AppError::BadRequest("invalid token".into()));
    }

    info!(selector=%payload.selector, user_id=%rec.user_id, "password reset token validated, updating user password");

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let pw_hash = argon2
        .hash_password(payload.new_password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal)?
        .to_string();
    db.update_user_password(&rec.user_id.to_string(), &pw_hash)
        .await
        .map_err(|_| AppError::Internal)?;

    db.mark_password_reset_used(&rec.id.to_string())
        .await
        .map_err(|_| AppError::Internal)?;

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(rec.user_id.as_str()),
        "password_reset.consume",
        None,
        None,
        serde_json::json!({"selector": payload.selector}),
        ip,
    )
    .await;

    info!(selector=%payload.selector, user_id=%rec.user_id, "password reset completed successfully");

    Ok(Json(ConsumeOut { ok: true }))
}
