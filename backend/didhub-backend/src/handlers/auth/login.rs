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
    let maybe = sqlx::query_as::<_, db_users::UsersRow>(r#"SELECT id, username, about_me, password_hash, avatar, is_system, is_approved, must_change_password, is_active, email_verified, last_login_at, display_name, created_at, updated_at, is_admin, roles, settings FROM users WHERE username = ?"#)
        .bind(&dto.username)
        .fetch_optional(&mut *conn)
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

    // Check if user is approved or admin
    if user.is_approved == 0 && user.is_admin == 0 {
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

    // Build claims
    let exp = (Utc::now().timestamp() + 7 * 24 * 60 * 60) as usize; // 7 days expiry
    let mut scopes = vec!["user"];
    if user.is_admin == 1 {
        scopes.push("admin");
    }
    let claims = serde_json::json!({
        "sub": user.id.to_string(),
        "exp": exp,
        "scopes": scopes
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
