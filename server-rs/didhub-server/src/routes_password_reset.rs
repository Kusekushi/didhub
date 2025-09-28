use axum::{extract::Extension, Json};
use base64::Engine;
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_db::Db;
use didhub_error::AppError;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{debug, info, warn};

#[derive(Debug, Deserialize)]
pub struct RequestResetPayload {
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct ResetTokenOut {
    pub selector: String,
    pub verifier: String,
    pub expires_at: String,
}

fn now_plus_hours(h: i64) -> String {
    use chrono::{Duration, Utc};
    (Utc::now() + Duration::hours(h))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    rand::rng().fill_bytes(&mut b);
    b
}

fn b64u(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

pub async fn request_reset(
    Extension(db): Extension<Db>,
    Json(payload): Json<RequestResetPayload>,
) -> Result<Json<ResetTokenOut>, AppError> {
    let uname = payload.username.trim();

    if uname.is_empty() {
        warn!("password reset requested with empty username");
        return Err(AppError::BadRequest("username required".into()));
    }

    debug!(username=%uname, "processing password reset request");

    let user = db
        .fetch_user_by_username(uname)
        .await
        .map_err(|_| AppError::Internal)?;

    // Always act like success to avoid user enumeration
    let Some(user) = user else {
        info!(username=%uname, "password reset requested for non-existent user (masked response)");
        return Ok(Json(ResetTokenOut {
            selector: String::new(),
            verifier: String::new(),
            expires_at: String::new(),
        }));
    };

    info!(user_id=%user.id, username=%uname, "creating password reset token for existing user");

    let selector_bytes = random_bytes::<8>();
    let verifier_bytes = random_bytes::<32>();
    let selector = b64u(&selector_bytes);
    let verifier = b64u(&verifier_bytes);
    let mut hasher = Sha256::new();
    hasher.update(&verifier_bytes);
    let hash = hasher.finalize();
    let expires_at = now_plus_hours(2);

    let _ = db
        .insert_password_reset(&selector, &hex::encode(hash), user.id, &expires_at)
        .await
        .map_err(|_| AppError::Internal)?;

    audit::record_with_metadata(
        &db,
        Some(user.id),
        "password_reset.request",
        None,
        None,
        serde_json::json!({"selector": selector}),
    )
    .await;

    info!(user_id=%user.id, selector=%selector, expires_at=%expires_at, "password reset token created successfully");

    Ok(Json(ResetTokenOut {
        selector,
        verifier,
        expires_at,
    }))
}

#[derive(Debug, Deserialize)]
pub struct VerifyPayload {
    pub selector: String,
    pub verifier: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyOut {
    pub valid: bool,
}

pub async fn verify_reset(
    Extension(db): Extension<Db>,
    Json(payload): Json<VerifyPayload>,
) -> Result<Json<VerifyOut>, AppError> {
    debug!(selector=%payload.selector, "verifying password reset token");

    let Some(rec) = db
        .fetch_password_reset_by_selector(&payload.selector)
        .await
        .map_err(|_| AppError::Internal)?
    else {
        debug!(selector=%payload.selector, "password reset token not found");
        return Ok(Json(VerifyOut { valid: false }));
    };

    // check expiry and used
    if let Some(_) = rec.used_at {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "attempted to verify already used password reset token");
        return Ok(Json(VerifyOut { valid: false }));
    }

    // expires_at is in local fmt string; compare via SQLite for simplicity
    // But here just return true; consume will enforce strictly against DB time
    let mut hasher = Sha256::new();
    hasher.update(
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(payload.verifier.as_bytes())
            .map_err(|_| AppError::BadRequest("invalid verifier".into()))?,
    );
    let hash_hex = hex::encode(hasher.finalize());

    let is_valid = hash_hex == rec.verifier_hash;

    if is_valid {
        info!(selector=%payload.selector, user_id=%rec.user_id, "password reset token verified successfully");
    } else {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "password reset token verification failed - invalid verifier");
    }

    audit::record_with_metadata(
        &db,
        Some(rec.user_id),
        "password_reset.verify",
        None,
        None,
        serde_json::json!({"selector": payload.selector, "valid": is_valid}),
    )
    .await;

    Ok(Json(VerifyOut { valid: is_valid }))
}

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

    // verify not used and not expired
    let now = chrono::Utc::now().to_rfc3339();
    let is_valid = db
        .validate_password_reset_token(rec.id, &now)
        .await
        .map_err(|_| AppError::Internal)?;

    if !is_valid {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "password reset failed - token expired or already used");
        return Err(AppError::BadRequest("token expired or used".into()));
    }

    // verify hash
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.verifier.as_bytes())
        .map_err(|_| AppError::BadRequest("invalid verifier".into()))?;
    let mut hasher = Sha256::new();
    hasher.update(raw);
    let hash_hex = hex::encode(hasher.finalize());

    if hash_hex != rec.verifier_hash {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "password reset failed - invalid verifier hash");
        return Err(AppError::BadRequest("invalid token".into()));
    }

    info!(selector=%payload.selector, user_id=%rec.user_id, "password reset token validated, updating user password");

    // rotate password
    let pw_hash = bcrypt::hash(&payload.new_password, bcrypt::DEFAULT_COST)
        .map_err(|_| AppError::Internal)?;
    db.update_user_password(rec.user_id, &pw_hash)
        .await
        .map_err(|_| AppError::Internal)?;

    db.mark_password_reset_used(rec.id)
        .await
        .map_err(|_| AppError::Internal)?;

    audit::record_with_metadata(
        &db,
        Some(rec.user_id),
        "password_reset.consume",
        None,
        None,
        serde_json::json!({"selector": payload.selector}),
    )
    .await;

    info!(selector=%payload.selector, user_id=%rec.user_id, "password reset completed successfully");

    Ok(Json(ConsumeOut { ok: true }))
}
