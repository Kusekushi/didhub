use std::sync::Arc;

use axum::extract::Extension;
use axum::http::{header::SET_COOKIE, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;

use crate::handlers::auth::utils::get_jwt_secret;
use crate::{error::ApiError, handlers::auth::utils::extract_auth_token, state::AppState};

/// POST /auth/refresh
/// For HS256 flows, re-issue a fresh token if the existing cookie is valid.
pub async fn refresh(
    Extension(state): Extension<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let bearer = extract_auth_token(&headers).ok_or_else(|| {
        ApiError::Authentication(didhub_auth::auth::AuthError::AuthenticationFailed)
    })?;

    // Authenticate using existing authenticator
    let auth = state
        .authenticator()
        .authenticate(Some(bearer.as_str()))
        .await
        .map_err(ApiError::from)?;

    if !auth.is_authenticated() {
        return Err(ApiError::Authentication(
            didhub_auth::auth::AuthError::AuthenticationFailed,
        ));
    }

    let user_id = auth.user_id.ok_or_else(|| {
        ApiError::Authentication(didhub_auth::auth::AuthError::AuthenticationFailed)
    })?;

    let mut conn = state.db_pool.acquire().await.map_err(ApiError::from)?;
    let user_row = didhub_db::generated::users::find_by_primary_key(&mut *conn, &user_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| {
            ApiError::Authentication(didhub_auth::auth::AuthError::AuthenticationFailed)
        })?;

    let current_roles: Vec<String> =
        serde_json::from_str(&user_row.roles).unwrap_or_default();

    let secret = get_jwt_secret()?;

    let exp = (Utc::now().timestamp() + 7 * 24 * 60 * 60) as usize;
    let claims = serde_json::json!({
        "sub": user_id.to_string(),
        "exp": exp,
        "scopes": current_roles,
    });

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| ApiError::Unexpected(format!("jwt encode failed: {}", e)))?;

    let cookie = cookie::Cookie::build(("didhub_session", token))
        .path("/")
        .http_only(true)
        .secure(true)
        .same_site(cookie::SameSite::Lax)
        .build();

    let mut resp = (StatusCode::OK, Json(json!({"ok": true}))).into_response();
    resp.headers_mut().append(
        SET_COOKIE,
        axum::http::HeaderValue::from_str(&cookie.to_string()).unwrap(),
    );
    Ok(resp)
}
