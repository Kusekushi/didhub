use axum::{extract::Extension, Json};
use base64::Engine;
use didhub_db::users::UserOperations;
use didhub_db::{audit, Db};
use didhub_error::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{debug, info, warn};

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

    if let Some(_) = rec.used_at {
        warn!(selector=%payload.selector, user_id=%rec.user_id, "attempted to verify already used password reset token");
        return Ok(Json(VerifyOut { valid: false }));
    }

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
