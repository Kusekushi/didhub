use axum::body::Body;
use axum::http::{header, HeaderMap, StatusCode};
use axum::{
    extract::{Extension, State},
    response::{IntoResponse, Response},
    Json,
};
use didhub_cache::Cache;
use didhub_db::audit;
use didhub_db::users::UserOperations;
use didhub_db::NewUser;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::utils::{extract_bearer_token, sign_jwt, validate_password_strength};
use crate::AuthState;

#[derive(Deserialize)]
pub struct RegisterPayload {
    pub username: String,
    pub password: String,
    pub is_system: Option<bool>,
}

#[derive(Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
}

#[derive(Serialize)]
pub struct RefreshResponse {
    pub token: String,
    pub refreshed: bool,
}

#[derive(Deserialize)]
pub struct ChangePasswordPayload {
    pub current_password: String,
    pub new_password: String,
}

pub async fn register(
    State(state): State<AuthState>,
    Json(payload): Json<RegisterPayload>,
) -> Result<impl IntoResponse, AppError> {
    debug!(username=%payload.username, is_system=%payload.is_system.unwrap_or(false), "user registration attempt");
    if payload.username.trim().is_empty() || payload.password.is_empty() {
        return Err(AppError::BadRequest(
            "username and password required".into(),
        ));
    }

    // Validate password strength
    if let Some(error) = validate_password_strength(&payload.password) {
        return Err(AppError::BadRequest(error));
    }

    if let Some(existing) = state
        .db
        .fetch_user_by_username(&payload.username)
        .await
        .map_err(|_| AppError::Internal)?
    {
        if existing.username == payload.username {
            warn!(username=%payload.username, "registration failed - user already exists");
            return Err(AppError::BadRequest("user exists".into()));
        }
    }
    let password_hash = bcrypt::hash(&payload.password, bcrypt::DEFAULT_COST).map_err(|_| AppError::Internal)?;
    let created = state
        .db
        .create_user(NewUser {
            username: payload.username.clone(),
            password_hash,
            is_system: payload.is_system.unwrap_or(false),
            is_approved: false,
        })
        .await
        .map_err(|e| {
            tracing::error!(
                target = "didhub_server",
                ?e,
                "db.create_user failed in register"
            );
            AppError::Internal
        })?;
    info!(user_id=%created.id, username=%created.username, is_system=%created.is_system != 0, "user registered successfully");
    tracing::debug!(target = "didhub_server", username=%payload.username, jwt_secret_len=%state.cfg.jwt_secret.len(), "about to sign jwt");
    let token = sign_jwt(&state.cfg, &payload.username)?;
    let body_str = serde_json::to_string(&AuthResponse { token }).unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut()
        .insert("X-Set-CSRF-Rotate", header::HeaderValue::from_static("1"));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    audit::record_entity(
        &state.db,
        Some(created.id),
        "auth.register",
        "user",
        &created.id.to_string(),
    )
    .await;
    Ok(resp)
}

pub async fn login(
    State(state): State<AuthState>,
    Json(payload): Json<LoginPayload>,
) -> Result<impl IntoResponse, AppError> {
    debug!(username=%payload.username, "login attempt");
    let user_opt = state
        .db
        .fetch_user_by_username(&payload.username)
        .await
        .map_err(|e| {
            tracing::error!(
                target = "didhub_server",
                ?e,
                "db.fetch_user_by_username failed"
            );
            AppError::Internal
        })?;
    let Some(user) = user_opt else {
        warn!(username=%payload.username, "login failed - user not found");
        audit::record_with_metadata(
            &state.db,
            None,
            "auth.login.fail",
            Some("user"),
            None,
            serde_json::json!({"reason":"user_not_found","username": payload.username}),
        )
        .await;
        return Err(AppError::Unauthorized);
    };
    if !bcrypt::verify(&payload.password, &user.password_hash).map_err(|e| {
        tracing::error!(target = "didhub_server", ?e, "bcrypt verify failed");
        AppError::Internal
    })? {
        warn!(user_id=%user.id, username=%user.username, "login failed - bad password");
        audit::record_with_metadata(
            &state.db,
            Some(user.id),
            "auth.login.fail",
            Some("user"),
            Some(&user.id.to_string()),
            serde_json::json!({"reason":"bad_password"}),
        )
        .await;
        return Err(AppError::Unauthorized);
    }
    // Deny login if user is not approved yet
    if user.is_approved == 0 {
        warn!(user_id=%user.id, username=%user.username, "login denied - user not approved");
        audit::record_with_metadata(
            &state.db,
            Some(user.id),
            "auth.login.not_approved",
            Some("user"),
            Some(&user.id.to_string()),
            serde_json::json!({"reason":"not_approved"}),
        )
        .await;
        return Err(AppError::NotApproved);
    }
    let token = sign_jwt(&state.cfg, &user.username)?;
    let body_str = serde_json::to_string(&AuthResponse { token }).unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut()
        .insert("X-Set-CSRF-Rotate", header::HeaderValue::from_static("1"));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    info!(user_id=%user.id, username=%user.username, "login successful");
    audit::record_entity(
        &state.db,
        Some(user.id),
        "auth.login.success",
        "user",
        &user.id.to_string(),
    )
    .await;
    Ok(resp)
}

// Issue a new JWT (sliding session) if the supplied token is still valid.
// Client supplies current token via Authorization: Bearer <token> header.
// If token is expired or invalid we return Unauthorized.
pub async fn refresh(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());
    let Some(raw_token) = extract_bearer_token(auth_header) else {
        return Err(AppError::Unauthorized);
    };
    // Decode existing token first. Reject if invalid or expired.
    let decoded = jsonwebtoken::decode::<crate::utils::Claims>(
        &raw_token,
        &jsonwebtoken::DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
        &jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256),
    )
    .map_err(|_| AppError::Unauthorized)?;
    // Ensure not expired
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;
    if decoded.claims.exp <= now {
        return Err(AppError::Unauthorized);
    }
    // (Optional) Only refresh if remaining time < threshold; currently always refresh to simplify client logic.
    let new_token = sign_jwt(&state.cfg, &decoded.claims.sub)?;
    let body_str = serde_json::to_string(&RefreshResponse {
        token: new_token,
        refreshed: true,
    })
    .unwrap();
    let mut resp = Response::new(Body::from(body_str));
    *resp.status_mut() = StatusCode::OK;
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    Ok(resp)
}

pub async fn me_handler(
    Extension(user): Extension<CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "id": user.id,
            "username": user.username,
            "avatar": user.avatar,
            "is_admin": user.is_admin,
            "is_system": user.is_system,
            "is_approved": user.is_approved,
            "must_change_password": user.must_change_password
        })),
    ))
}

pub async fn change_password(
    State(state): State<AuthState>,
    Extension(user): Extension<CurrentUser>,
    Json(payload): Json<ChangePasswordPayload>,
) -> Result<impl IntoResponse, AppError> {
    // Validate new password strength
    if let Some(error) = validate_password_strength(&payload.new_password) {
        return Err(AppError::BadRequest(error));
    }

    let db_user = state
        .db
        .fetch_user_by_username(&user.username)
        .await
        .map_err(|_| AppError::Internal)?
        .ok_or(AppError::Unauthorized)?;
    if !bcrypt::verify(&payload.current_password, &db_user.password_hash).map_err(|_| AppError::Internal)? {
        return Err(AppError::Unauthorized);
    }
    let new_hash = bcrypt::hash(&payload.new_password, bcrypt::DEFAULT_COST).map_err(|_| AppError::Internal)?;
    let mut fields = didhub_db::UpdateUserFields::default();
    fields.password_hash = Some(new_hash);
    fields.must_change_password = Some(false);
    let _ = state
        .db
        .update_user(db_user.id, fields)
        .await
        .map_err(|_| AppError::Internal)?;

    // Invalidate user cache since password and must_change_password changed
    let cache_key = format!("user:{}", user.username);
    if let Err(e) = state.cache.del(&cache_key).await {
        tracing::warn!(username=%user.username, error=?e, "failed to invalidate user cache after password change");
    }

    audit::record_simple(&state.db, Some(user.id), "user.password.change").await;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({"ok": true, "must_change_password": false})),
    ))
}