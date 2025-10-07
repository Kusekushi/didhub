use didhub_config::AppConfig;
use didhub_error::AppError;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

/// Extract a bearer token from an Authorization header value in a
/// case-insensitive manner. Returns trimmed token string when present.
pub fn extract_bearer_token(h: Option<&str>) -> Option<String> {
    let h = h?;
    // Split on whitespace into at most 2 parts: scheme and token
    let mut parts = h.splitn(2, char::is_whitespace);
    let scheme = parts.next()?;
    let token = parts.next()?;
    if scheme.eq_ignore_ascii_case("bearer") && !token.trim().is_empty() {
        Some(token.trim().to_string())
    } else {
        None
    }
}

/// Validate password strength requirements
pub fn validate_password_strength(password: &str) -> Option<String> {
    if password.len() < 8 {
        return Some("password too short. want at least 8 characters.".into());
    }
    if password.len() > 128 {
        return Some("password too long. maximum 128 characters.".into());
    }
    if !password.chars().any(|c| c.is_ascii_uppercase()) {
        return Some("password must contain at least one uppercase letter.".into());
    }
    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        return Some("password must contain at least one lowercase letter.".into());
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Some("password must contain at least one digit.".into());
    }
    // Check for common weak passwords (basic check)
    let weak_passwords = ["password", "12345678", "qwerty", "abc123", "password123"];
    let password_lower = password.to_lowercase();
    if weak_passwords
        .iter()
        .any(|weak| password_lower.contains(weak))
    {
        return Some("password is too common. please choose a stronger password.".into());
    }
    None
}

pub fn sign_jwt(cfg: &AppConfig, username: &str) -> Result<String, AppError> {
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 60 * 60 * 24 * 7; // 7 days
    let claims = Claims {
        sub: username.to_string(),
        exp: exp as usize,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, username = %username, "jwt signing failed");
        AppError::Internal
    })
}
