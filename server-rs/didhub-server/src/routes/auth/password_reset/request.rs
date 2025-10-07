use axum::{extract::Extension, Json};
use base64::Engine;
use blake3;
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_db::Db;
use didhub_error::AppError;
use rand::RngCore;
use serde::Deserialize;
use serde::Serialize;
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
    let mut hasher = blake3::Hasher::new();
    hasher.update(&verifier_bytes);
    let hash = hasher.finalize();
    let expires_at = now_plus_hours(2);

    let _ = db
        .insert_password_reset(&selector, &hash.to_hex().to_string(), user.id, &expires_at)
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
