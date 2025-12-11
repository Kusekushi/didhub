use std::sync::Arc;

use axum::extract::Extension;
use axum::http::{header::SET_COOKIE, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use chrono::Utc;
use didhub_db::generated::users as db_users;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;

use crate::handlers::auth::utils::get_jwt_secret;
use crate::{error::ApiError, state::AppState};

/// Helper to check if a user has a specific role
fn user_has_role(roles_json: &str, role: &str) -> bool {
    serde_json::from_str::<Vec<String>>(roles_json)
        .map(|roles| roles.iter().any(|r| r == role))
        .unwrap_or(false)
}

/// POST /auth/login
/// Accepts { email, password } and if valid issues an HttpOnly cookie with an HS256 JWT.
pub async fn login(
    Extension(state): Extension<Arc<AppState>>,
    body: Option<Json<serde_json::Value>>,
) -> Result<Response, ApiError> {
    let payload = body
        .as_ref()
        .ok_or_else(|| ApiError::bad_request("missing request body"))?
        .0
        .clone();

    let dto: super::dto::Login = serde_json::from_value(payload).map_err(ApiError::from)?;

    let secret = get_jwt_secret()?;

    // Lookup user by username
    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let maybe = db_users::find_first_by_username(&mut *conn, &dto.username)
        .await
        .map_err(ApiError::from)?;
    let user = maybe
        .ok_or_else(|| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    // Verify password using didhub_auth
    // Supports both client-side SHA-256 hashed passwords (64 hex chars) and legacy plaintext
    let verify_result = if didhub_auth::is_client_hash(&dto.password_hash) {
        didhub_auth::verify_client_password(&dto.password_hash, &user.password_hash)
    } else {
        // Legacy support: accept plaintext password during migration
        didhub_auth::verify_password(&dto.password_hash, &user.password_hash)
    };
    verify_result
        .map_err(|_| ApiError::Authentication(didhub_auth::AuthError::AuthenticationFailed))?;

    // Check if user is approved (has 'user' role) or is admin (admins bypass approval check)
    let is_admin = user_has_role(&user.roles, "admin");
    let is_approved = user_has_role(&user.roles, "user");
    if !is_approved && !is_admin {
        return Err(ApiError::forbidden("Account awaiting approval"));
    }

    // Update last_login_at
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
        .bind(&now)
        .bind(user.id)
        .execute(&mut *conn)
        .await
        .map_err(ApiError::from)?;

    // Build claims - scopes are derived from roles
    let exp = (Utc::now().timestamp() + 7 * 24 * 60 * 60) as usize; // 7 days expiry
    let roles: Vec<String> = serde_json::from_str(&user.roles).unwrap_or_default();
    let claims = serde_json::json!({
        "sub": user.id.to_string(),
        "exp": exp,
        "scopes": roles
    });

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| ApiError::Unexpected(format!("jwt encode failed: {}", e)))?;

    // Set cookie
    let cookie = cookie::Cookie::build(("didhub_session", token))
        .path("/")
        .http_only(true)
        .same_site(cookie::SameSite::Lax)
        .build();

    let mut resp = (StatusCode::OK, Json(json!({"user_id": user.id}))).into_response();
    resp.headers_mut().append(
        SET_COOKIE,
        axum::http::HeaderValue::from_str(&cookie.to_string()).unwrap(),
    );
    Ok(resp)
}
